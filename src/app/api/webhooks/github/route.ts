import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/database';
import { UserModel } from '@/models/User';
import { CodeReviewModel } from '@/models/CodeReview';
import { generateAICodeReview } from '@/lib/ai-review';
import { githubAppService } from '@/lib/github-app';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    
    // Verify webhook signature (basic implementation)
    if (!verifyWebhookSignature(body, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = request.headers.get('x-github-event');
    const payload = JSON.parse(body);

    console.log(`Received GitHub webhook: ${event} for ${payload.repository?.full_name}`);

    // Handle installation events (app installed/uninstalled)
    if (event === 'installation') {
      const action = payload.action;
      const installationId = payload.installation.id;
      
      if (action === 'deleted') {
        // Clear cache for all repositories in this installation
        const repositories = payload.repositories || [];
        for (const repo of repositories) {
          const [owner, repoName] = repo.full_name.split('/');
          githubAppService.clearInstallationCache(owner);
        }
        console.log(`🗑️ Cleared installation cache for installation ${installationId}`);
      }
      
      return NextResponse.json({ message: 'Installation event processed' });
    }

    // Only handle pull request events
    if (event !== 'pull_request') {
      return NextResponse.json({ message: 'Event ignored' });
    }

    const action = payload.action;
    const repository = payload.repository.full_name;
    const pullRequest = payload.pull_request;
    const installationId = payload.installation?.id;

    // Only process opened, synchronize, and reopened PRs
    if (!['opened', 'synchronize', 'reopened'].includes(action)) {
      return NextResponse.json({ message: 'Action ignored' });
    }

    // Connect to database
    await connectDB();

    // Check if this repository is enabled for AI reviews
    const user = await UserModel.findOne({ repositories: repository });
    
    if (!user) {
      console.log(`Repository ${repository} not enabled for AI reviews`);
      return NextResponse.json({ message: 'Repository not enabled' });
    }

    // Check if we already have a review for this PR
    const existingReview = await CodeReviewModel.findOne({
      repositoryId: payload.repository.id,
      pullRequestId: pullRequest.id,
    });

    if (existingReview && action === 'opened') {
      console.log(`Review already exists for PR #${pullRequest.number} in ${repository}`);
      return NextResponse.json({ message: 'Review already exists' });
    }

    // Create or update review record
    let review;
    if (existingReview) {
      // Update existing review
      review = await CodeReviewModel.findByIdAndUpdate(
        existingReview._id,
        {
          status: 'pending',
          updatedAt: new Date(),
        },
        { new: true }
      );
    } else {
      // Create new review
      review = new CodeReviewModel({
        repositoryId: payload.repository.id,
        pullRequestId: pullRequest.id,
        repositoryName: repository,
        status: 'pending',
      });
      await review.save();
    }

    // Trigger AI review in background
    processAICodeReview(review._id.toString(), repository, pullRequest, installationId);

    return NextResponse.json({ 
      message: 'Review triggered',
      reviewId: review._id 
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function processAICodeReview(reviewId: string, repository: string, pullRequest: any, installationId: number) {
  try {
    console.log(`Starting AI review for PR #${pullRequest.number} in ${repository}`);

    let installationToken: string;

    // Try to use installation ID from webhook payload first
    if (installationId) {
      try {
        const jwt = githubAppService.generateJWT();
        const tokenResponse = await fetch(
          `https://api.github.com/app/installations/${installationId}/access_tokens`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${jwt}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        );

        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          installationToken = tokenData.token;
        } else {
          throw new Error(`Webhook installation ID failed: ${tokenResponse.statusText}`);
        }
      } catch (error) {
        // Fallback to dynamic installation lookup
        const [owner, repo] = repository.split('/');
        installationToken = await githubAppService.getInstallationTokenForRepo(owner, repo);
      }
    } else {
      // No installation ID in webhook, use dynamic lookup
      const [owner, repo] = repository.split('/');
      installationToken = await githubAppService.getInstallationTokenForRepo(owner, repo);
    }

    // Fetch PR files and diff
    const filesResponse = await fetch(
      `https://api.github.com/repos/${repository}/pulls/${pullRequest.number}/files`,
      {
        headers: {
          'Authorization': `Bearer ${installationToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!filesResponse.ok) {
      throw new Error(`Failed to fetch PR files: ${filesResponse.statusText}`);
    }

    const files = await filesResponse.json();

    // Filter out non-code files
    const codeFiles = files.filter((file: any) => {
      const extension = file.filename.split('.').pop()?.toLowerCase();
      const codeExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'clj', 'hs', 'ml', 'f90', 'r', 'm', 'pl', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'sql', 'html', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'astro'];
      return codeExtensions.includes(extension);
    });

    if (codeFiles.length === 0) {
      console.log(`No code files found in PR #${pullRequest.number}`);
      await updateReviewStatus(reviewId, 'completed', {
        summary: 'No code files to review',
        score: 100,
        suggestions: [],
        issues: [],
      });
      return;
    }

    // Fetch file contents for changed files
    const fileContents = await Promise.all(
      codeFiles.map(async (file: any) => {
        try {
          const contentResponse = await fetch(
            `https://api.github.com/repos/${repository}/contents/${file.filename}?ref=${pullRequest.head.sha}`,
            {
              headers: {
                'Authorization': `Bearer ${installationToken}`,
                'Accept': 'application/vnd.github.v3+json',
              },
            }
          );

          if (contentResponse.ok) {
            const content = await contentResponse.json();
            return {
              filename: file.filename,
              content: Buffer.from(content.content, 'base64').toString('utf-8'),
              patch: file.patch,
              additions: file.additions,
              deletions: file.deletions,
            };
          }
          return null;
        } catch (error) {
          console.error(`Failed to fetch content for ${file.filename}:`, error);
          return null;
        }
      })
    );

    const validFiles = fileContents.filter(Boolean);

    if (validFiles.length === 0) {
      console.log(`No valid file contents found in PR #${pullRequest.number}`);
      await updateReviewStatus(reviewId, 'completed', {
        summary: 'Unable to fetch file contents for review',
        score: 0,
        suggestions: [],
        issues: [],
      });
      return;
    }

    // Generate AI review
    const aiReview = await generateAICodeReview({
      repository,
      pullRequest: {
        title: pullRequest.title,
        description: pullRequest.body,
        number: pullRequest.number,
      },
      files: validFiles,
    });

    // Update review with AI results
    await updateReviewStatus(reviewId, 'completed', aiReview);

    // Post comment to GitHub PR
    await postGitHubComment(repository, pullRequest.number, aiReview, installationToken);

    console.log(`AI review completed for PR #${pullRequest.number} in ${repository}`);

  } catch (error) {
    console.error(`AI review failed for PR #${pullRequest.number}:`, error);
    await updateReviewStatus(reviewId, 'failed', {
      summary: 'Review failed due to an error',
      score: 0,
      suggestions: [],
      issues: [],
    });
  }
}

async function updateReviewStatus(reviewId: string, status: string, reviewData?: any) {
  try {
    await connectDB();
    await CodeReviewModel.findByIdAndUpdate(reviewId, {
      status,
      review: reviewData,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to update review status:', error);
  }
}

async function postGitHubComment(repository: string, prNumber: number, review: any, installationToken: string) {
  try {
    const comment = generateGitHubComment(review);
    
    // Post comment using GitHub App installation token
    const response = await fetch(
      `https://api.github.com/repos/${repository}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${installationToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: comment }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to post GitHub comment:', response.status, errorText);
      throw new Error(`GitHub comment failed: ${response.status} - ${errorText}`);
    } else {
      console.log(`✅ Bot comment posted to PR #${prNumber} in ${repository}`);
    }
  } catch (error) {
    console.error('❌ Error posting GitHub comment:', error);
  }
}

function generateGitHubComment(review: any): string {
  const score = review.score;
  const scoreEmoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
  
  let comment = `## 🤖 AI Code Review Bot\n\n`;
  comment += `${scoreEmoji} **Overall Score: ${score}/100**\n\n`;
  comment += `### Summary\n${review.summary}\n\n`;

  if (review.suggestions && review.suggestions.length > 0) {
    comment += `### 💡 Suggestions\n`;
    review.suggestions.forEach((suggestion: any, index: number) => {
      const title = suggestion.title || suggestion.message || 'Suggestion';
      const description = suggestion.description || suggestion.message || '';
      const fileInfo = suggestion.file ? `**${suggestion.file}${suggestion.line ? ` (line ${suggestion.line})` : ''}**` : '**General**';
      comment += `${index + 1}. ${fileInfo}: ${title}\n`;
      if (description && description !== title) {
        comment += `   ${description}\n`;
      }
    });
    comment += `\n`;
  }

  if (review.issues && review.issues.length > 0) {
    comment += `### ⚠️ Issues\n`;
    review.issues.forEach((issue: any, index: number) => {
      const title = issue.title || issue.message || 'Issue';
      const description = issue.description || issue.message || '';
      const fileInfo = issue.file ? `**${issue.file}${issue.line ? ` (line ${issue.line})` : ''}**` : '**General**';
      comment += `${index + 1}. ${fileInfo}: ${title}\n`;
      if (description && description !== title) {
        comment += `   ${description}\n`;
      }
    });
    comment += `\n`;
  }

  if (review.positiveAspects && review.positiveAspects.length > 0) {
    comment += `### ✅ Positive Aspects\n`;
    review.positiveAspects.forEach((aspect: string, index: number) => {
      comment += `${index + 1}. ${aspect}\n`;
    });
    comment += `\n`;
  }

  comment += `---\n*🤖 This review was automatically generated by Mega Miyya AI Code Review Bot*\n`;
  comment += `*💡 This is an AI-powered review. Please verify suggestions before implementing.*`;

  return comment;
}

function verifyWebhookSignature(body: string, signature: string | null): boolean {
  // Basic signature verification - in production, use proper crypto
  if (!signature || !process.env.GITHUB_WEBHOOK_SECRET) {
    return true; // Skip verification if no secret configured
  }

  const crypto = require('crypto');
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    .update(body)
    .digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
} 