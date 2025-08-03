import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/database';
import { UserModel } from '@/models/User';

// Get user's repositories from GitHub
export async function GET(request: NextRequest) {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get('session_token')?.value;
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Decode session token
    const decoded = Buffer.from(sessionToken, 'base64').toString();
    const [githubId] = decoded.split(':');

    if (!githubId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Connect to database
    await connectDB();

    // Find user
    const user = await UserModel.findOne({ githubId: parseInt(githubId) });
    
    if (!user || !user.accessToken) {
      return NextResponse.json({ error: 'User not found or no access token' }, { status: 401 });
    }

    // Fetch repositories from GitHub
    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `Bearer ${user.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      console.error('GitHub API error:', await response.text());
      return NextResponse.json({ error: 'Failed to fetch repositories' }, { status: 500 });
    }

    const repositories = await response.json();

    // Filter out forks and format repository data
    const userRepos = repositories
      .filter((repo: any) => !repo.fork && repo.permissions?.admin)
      .map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        language: repo.language,
        stars: repo.stargazers_count,
        updatedAt: repo.updated_at,
        isEnabled: user.repositories.includes(repo.full_name),
      }));

    return NextResponse.json({ 
      repositories: userRepos,
      selectedRepositories: user.repositories 
    });

  } catch (error) {
    console.error('Error fetching repositories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Update selected repositories
export async function POST(request: NextRequest) {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get('session_token')?.value;
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Decode session token
    const decoded = Buffer.from(sessionToken, 'base64').toString();
    const [githubId] = decoded.split(':');

    if (!githubId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Get request body
    const { repositories } = await request.json();

    if (!Array.isArray(repositories)) {
      return NextResponse.json({ error: 'Invalid repositories data' }, { status: 400 });
    }

    // Connect to database
    await connectDB();

    // Update user's selected repositories
    const user = await UserModel.findOneAndUpdate(
      { githubId: parseInt(githubId) },
      { repositories: repositories },
      { new: true }
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true,
      repositories: user.repositories 
    });

  } catch (error) {
    console.error('Error updating repositories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 