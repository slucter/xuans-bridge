'use client';

interface LoadingPlaceholderProps {
  type?: 'folders' | 'videos' | 'table' | 'form' | 'list';
  count?: number;
}

export default function LoadingPlaceholder({ type = 'list', count = 5 }: LoadingPlaceholderProps) {
  if (type === 'folders') {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="flex gap-1.5">
            <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
        
        {/* Folder Tree Skeleton */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="h-8 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
          {Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md"
              style={{ paddingLeft: `${(i % 3) * 16 + 8}px` }}
            >
              <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 flex-1 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'videos' || type === 'table') {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="h-8 flex-1 sm:w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="flex-1 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
              <tr>
                {['', 'Thumbnail', 'Name', 'Folder', 'Status', 'Links', 'Date', 'Actions'].map((header, i) => (
                  <th key={i} className="px-3 py-2 text-left">
                    <div className="h-3 w-16 bg-gray-300 dark:bg-gray-700 rounded animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {Array.from({ length: count }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-10 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2">
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                  </td>
                  <td className="hidden md:table-cell px-3 py-2">
                    <div className="space-y-0.5">
                      <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>
                  </td>
                  <td className="hidden lg:table-cell px-3 py-2">
                    <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (type === 'form') {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default list skeleton
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

