import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/database';
import { UserModel } from '@/models/User';

export async function GET(request: NextRequest) {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get('session_token')?.value;
    
    if (!sessionToken) {
      return NextResponse.json({ user: null });
    }

    // Decode session token (simple base64 for now)
    const decoded = Buffer.from(sessionToken, 'base64').toString();
    const [githubId] = decoded.split(':');

    if (!githubId) {
      return NextResponse.json({ user: null });
    }

    // Connect to database
    await connectDB();

    // Find user by GitHub ID
    const user = await UserModel.findOne({ githubId: parseInt(githubId) }).select('-accessToken');
    
    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ 
      user: {
        id: user._id,
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        repositories: user.repositories,
        settings: user.settings,
        createdAt: user.createdAt,
      }
    });

  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ user: null });
  }
} 