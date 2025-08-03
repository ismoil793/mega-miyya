import { NextRequest, NextResponse } from 'next/server';
import { githubAppService } from '@/lib/github-app';

export async function POST(request: NextRequest) {
  try {
    const { repositories } = await request.json();

    if (!Array.isArray(repositories)) {
      return NextResponse.json({ error: 'Invalid repositories data' }, { status: 400 });
    }

    // Check if GitHub App is configured
    if (!githubAppService.isConfigured()) {
      return NextResponse.json({ 
        installations: {},
        message: 'GitHub App not configured' 
      });
    }

    const installations: Record<string, boolean> = {};

    // Check each repository for GitHub App installation
    for (const repository of repositories) {
      try {
        const [owner, repo] = repository.split('/');
        
        // Try to get installation ID for this repository
        await githubAppService.getInstallationIdForRepo(owner, repo);
        installations[repository] = true; // App is installed
      } catch (error) {
        // If we get a 404, the app is not installed
        if (error instanceof Error && error.message.includes('404')) {
          installations[repository] = false; // App is not installed
        } else {
          // For other errors, assume not installed
          installations[repository] = false;
        }
      }
    }

    return NextResponse.json({ 
      installations,
      appName: process.env.GITHUB_APP_NAME || 'mega-miyya',
      message: 'Installation status checked successfully'
    });

  } catch (error) {
    console.error('Error checking installation status:', error);
    return NextResponse.json({ 
      error: 'Failed to check installation status' 
    }, { status: 500 });
  }
} 