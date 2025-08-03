import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/database';
import { CodeReviewModel } from '@/models/CodeReview';
import { ApiResponse, PaginatedResponse } from '@/types';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const repository = searchParams.get('repository');
    const status = searchParams.get('status');

    // Build query
    const query: any = {};
    if (repository) {
      query.repositoryName = { $regex: repository, $options: 'i' };
    }
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const total = await CodeReviewModel.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Fetch reviews
    const reviews = await CodeReviewModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const response: PaginatedResponse<any> = {
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch reviews:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pullRequestId, repositoryId, repositoryName } = body;

    if (!pullRequestId || !repositoryId || !repositoryName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await connectDB();

    // Check if review already exists
    const existingReview = await CodeReviewModel.findOne({
      pullRequestId,
      repositoryId,
    });

    if (existingReview) {
      return NextResponse.json(
        { error: 'Review already exists for this pull request' },
        { status: 409 }
      );
    }

    // Create new review
    const review = new CodeReviewModel({
      pullRequestId,
      repositoryId,
      repositoryName,
      status: 'pending',
    });

    await review.save();

    const response: ApiResponse = {
      success: true,
      data: review,
      message: 'Review created successfully',
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Failed to create review:', error);
    return NextResponse.json(
      { error: 'Failed to create review' },
      { status: 500 }
    );
  }
} 