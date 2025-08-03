import OpenAI from 'openai';

interface FileContent {
  filename: string;
  content: string;
  patch: string;
  additions: number;
  deletions: number;
}

interface PullRequest {
  title: string;
  description: string;
  number: number;
}

interface ReviewRequest {
  repository: string;
  pullRequest: PullRequest;
  files: FileContent[];
}

interface Suggestion {
  id: string;
  type: 'improvement' | 'bug_fix' | 'security' | 'performance' | 'style';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  file?: string;
  line?: number;
  code?: string;
  suggestedFix?: string;
}

interface Issue {
  id: string;
  type: 'bug' | 'security' | 'performance' | 'style' | 'maintainability';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  file?: string;
  line?: number;
  code?: string;
  suggestedFix?: string;
}

interface AIReview {
  summary: string;
  score: number;
  suggestions: Suggestion[];
  issues: Issue[];
  positiveAspects: string[];
}

export async function generateAICodeReview(request: ReviewRequest): Promise<AIReview> {
  const aiProvider = process.env.AI_PROVIDER || 'openai';
  
  switch (aiProvider) {
    case 'openai':
      return generateOpenAIReview(request);
    case 'ollama':
      return generateOllamaReview(request);
    case 'huggingface':
      return generateHuggingFaceReview(request);
    default:
      return generateOpenAIReview(request);
  }
}

async function generateOpenAIReview(request: ReviewRequest): Promise<AIReview> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = buildReviewPrompt(request);
  
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert code reviewer. Analyze the provided code changes and provide constructive feedback. Focus on code quality, best practices, security, and maintainability.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    return parseAIResponse(response);
  } catch (error) {
    console.error('OpenAI review generation failed:', error);
    return {
      summary: 'Failed to generate AI review due to an error',
      score: 0,
      suggestions: [],
      issues: [],
      positiveAspects: [],
    };
  }
}

async function generateOllamaReview(request: ReviewRequest): Promise<AIReview> {
  const prompt = buildReviewPrompt(request);
  
  try {
    const response = await fetch(process.env.OLLAMA_URL || 'http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'codellama',
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return parseAIResponse(data.response);
  } catch (error) {
    console.error('Ollama review generation failed:', error);
    return {
      summary: 'Failed to generate AI review due to an error',
      score: 0,
      suggestions: [],
      issues: [],
      positiveAspects: [],
    };
  }
}

async function generateHuggingFaceReview(request: ReviewRequest): Promise<AIReview> {
  const prompt = buildReviewPrompt(request);
  const provider = process.env.HUGGINGFACE_PROVIDER || 'novita';
  const model = process.env.HUGGINGFACE_MODEL || 'deepseek/deepseek-r1-0528';

  if (provider !== 'novita') {
    return {
      summary: `Hugging Face provider '${provider}' is not supported. Set HUGGINGFACE_PROVIDER=novita for Novita API.`,
      score: 0,
      suggestions: [],
      issues: [],
      positiveAspects: [],
    };
  }

  try {
    const response = await fetch(`https://router.huggingface.co/${provider}/v3/openai/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.1,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hugging Face API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;

    if (!responseText) {
      throw new Error('No response content from Hugging Face API');
    }

    const parsedReview = parseAIResponse(responseText);
    return parsedReview;
  } catch (error) {
    console.error('❌ Hugging Face review generation failed:', error);
    throw error;
  }
}

function buildReviewPrompt(request: ReviewRequest): string {
  let prompt = `Review this code and respond with ONLY valid JSON.

Repository: ${request.repository}
PR #${request.pullRequest.number}: ${request.pullRequest.title}

Files:`;

  request.files.forEach((file, index) => {
    prompt += `\n${file.filename} (+${file.additions} -${file.deletions})
${file.content.substring(0, 1000)}${file.content.length > 1000 ? '...' : ''}`;
  });

  prompt += `

Respond with ONLY this JSON:
{
  "summary": "Brief summary of the changes",
  "score": 85,
  "positiveAspects": ["Good variable naming"],
  "suggestions": [
    {
      "id": "suggestion_1",
      "type": "improvement",
      "title": "Use const instead of let",
      "description": "Consider using const for variables that won't be reassigned",
      "severity": "low",
      "file": "filename.js",
      "line": 10
    }
  ],
  "issues": [
    {
      "id": "issue_1",
      "type": "security",
      "title": "Potential security vulnerability",
      "description": "User input not sanitized",
      "severity": "high",
      "file": "filename.js",
      "line": 42
    }
  ]
}

Score: 0-100. ONLY return the JSON object.`;

  return prompt;
}

function parseAIResponse(response: string): AIReview {
  try {
    // Clean the response - remove any leading/trailing whitespace
    let cleanedResponse = response.trim();
    
    // Remove <think> tags and their content
    cleanedResponse = cleanedResponse.replace(/<think>[\s\S]*?<\/think>/g, '');
    
    // Remove markdown code blocks
    cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
    
    // Remove any leading/trailing whitespace again
    cleanedResponse = cleanedResponse.trim();
    
    // Try to parse the entire response as JSON first
    try {
      const parsed = JSON.parse(cleanedResponse);
      return {
        summary: parsed.summary || 'No summary provided',
        score: Math.max(0, Math.min(100, parsed.score || 0)),
        suggestions: (parsed.suggestions || []).map((s: any, index: number) => ({
          id: s.id || `suggestion_${index + 1}`,
          type: s.type || 'improvement',
          title: s.title || s.message || 'Suggestion',
          description: s.description || s.message || 'Code improvement suggestion',
          severity: s.severity || 'low',
          file: s.file,
          line: s.line,
          code: s.code,
          suggestedFix: s.suggestedFix,
        })),
        issues: (parsed.issues || []).map((i: any, index: number) => ({
          id: i.id || `issue_${index + 1}`,
          type: i.type || 'bug',
          title: i.title || i.message || 'Issue',
          description: i.description || i.message || 'Code issue found',
          severity: i.severity || 'medium',
          file: i.file,
          line: i.line,
          code: i.code,
          suggestedFix: i.suggestedFix,
        })),
        positiveAspects: parsed.positiveAspects || [],
      };
    } catch (directParseError) {
      // If direct parsing fails, try to extract JSON from the response
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'No summary provided',
          score: Math.max(0, Math.min(100, parsed.score || 0)),
          suggestions: (parsed.suggestions || []).map((s: any, index: number) => ({
            id: s.id || `suggestion_${index + 1}`,
            type: s.type || 'improvement',
            title: s.title || s.message || 'Suggestion',
            description: s.description || s.message || 'Code improvement suggestion',
            severity: s.severity || 'low',
            file: s.file,
            line: s.line,
            code: s.code,
            suggestedFix: s.suggestedFix,
          })),
          issues: (parsed.issues || []).map((i: any, index: number) => ({
            id: i.id || `issue_${index + 1}`,
            type: i.type || 'bug',
            title: i.title || i.message || 'Issue',
            description: i.description || i.message || 'Code issue found',
            severity: i.severity || 'medium',
            file: i.file,
            line: i.line,
            code: i.code,
            suggestedFix: i.suggestedFix,
          })),
          positiveAspects: parsed.positiveAspects || [],
        };
      }
    }
  } catch (error) {
    console.error('❌ Failed to parse AI response as JSON:', error);
  }

  // Fallback response if parsing fails
  return {
    summary: 'Unable to parse AI review response',
    score: 0,
    suggestions: [],
    issues: [],
    positiveAspects: [],
  };
} 