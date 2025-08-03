'use client';

import { CodeReview } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface ReviewCardProps {
  review: CodeReview;
  onViewDetails?: (review: CodeReview) => void;
}

export default function ReviewCard({ review, onViewDetails }: ReviewCardProps) {
  const getStatusBadge = (status: string) => {
    const statusClasses = {
      pending: 'badge-warning',
      completed: 'badge-success',
      failed: 'badge-error',
    };
    
    return (
      <span className={`badge ${statusClasses[status as keyof typeof statusClasses] || 'badge-info'}`}>
        {status}
      </span>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreEmoji = (score: number) => {
    if (score >= 80) return '🎉';
    if (score >= 60) return '👍';
    return '⚠️';
  };

  return (
    <div className="card hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {review.repositoryName}
            </h3>
            {getStatusBadge(review.status)}
          </div>
          
          <p className="text-sm text-gray-500">
            PR #{review.pullRequestId} • Created {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
          </p>
        </div>
        
        {review.review && (
          <div className="text-right">
            <div className={`text-2xl font-bold ${getScoreColor(review.review.score)}`}>
              {getScoreEmoji(review.review.score)} {review.review.score}
            </div>
            <p className="text-xs text-gray-500">Score</p>
          </div>
        )}
      </div>

      {review.review && (
        <div className="space-y-4">
          <div>
            <p className="text-gray-700 leading-relaxed">
              {review.review.summary}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="font-medium text-green-800 mb-1">
                ✅ Positive Aspects
              </div>
              <div className="text-green-700">
                {review.review.positiveAspects.length > 0 
                  ? review.review.positiveAspects.slice(0, 2).join(', ')
                  : 'No specific positives noted'
                }
              </div>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="font-medium text-blue-800 mb-1">
                💡 Suggestions
              </div>
              <div className="text-blue-700">
                {review.review.suggestions.length} suggestions provided
              </div>
            </div>
          </div>

          {review.review.issues.length > 0 && (
            <div className="bg-red-50 p-3 rounded-lg">
              <div className="font-medium text-red-800 mb-1">
                ⚠️ Issues Found
              </div>
              <div className="text-red-700">
                {review.review.issues.length} issues identified
              </div>
            </div>
          )}

          {review.metadata && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {review.metadata.totalFiles} files • {review.metadata.totalLines} lines
                </span>
                <span>
                  {review.metadata.languages.join(', ')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {review.status === 'pending' && (
        <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
            <span className="text-yellow-800 text-sm">Review in progress...</span>
          </div>
        </div>
      )}

      {review.status === 'failed' && (
        <div className="mt-4 p-3 bg-red-50 rounded-lg">
          <span className="text-red-800 text-sm">Review failed to complete</span>
        </div>
      )}

      <div className="mt-6 flex justify-end space-x-3">
        {onViewDetails && (
          <button
            onClick={() => onViewDetails(review)}
            className="btn-secondary text-sm"
          >
            View Details
          </button>
        )}
      </div>
    </div>
  );
} 