import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/database';
import { UserModel } from '@/models/User';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      return NextResponse.redirect(new URL('/?error=oauth_failed', request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/?error=no_code', request.url));
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData);
      return NextResponse.redirect(new URL('/?error=token_exchange_failed', request.url));
    }

    const accessToken = tokenData.access_token;

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error('GitHub API error:', userData);
      return NextResponse.redirect(new URL('/?error=github_api_failed', request.url));
    }

    // Connect to database
    await connectDB();

    // Find or create user
    let user = await UserModel.findOne({ githubId: userData.id });

    if (!user) {
      // Create new user
      user = new UserModel({
        githubId: userData.id,
        githubUsername: userData.login,
        email: userData.email,
        name: userData.name,
        avatarUrl: userData.avatar_url,
        accessToken: accessToken,
        repositories: [],
        settings: {
          aiProvider: process.env.DEFAULT_AI_PROVIDER || 'openai',
          autoReview: true,
          reviewScope: 'all',
        },
      });
    } else {
      // Update existing user's access token
      user.accessToken = accessToken;
      user.githubUsername = userData.login;
      user.email = userData.email;
      user.name = userData.name;
      user.avatarUrl = userData.avatar_url;
    }

    await user.save();

    // Create session token (simple base64 encoding for now)
    const sessionToken = Buffer.from(`${user.githubId}:${Date.now()}`).toString('base64');

    // Redirect to dashboard with success status
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('success', 'connected');

    const response = NextResponse.redirect(redirectUrl);
    
    // Set session cookie
    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;

  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL('/?error=server_error', request.url));
  }
} 