export type ApiResponse<T> = {
  success: boolean;
  data: T;
  metadata?: Record<string, unknown>;
};

export type ApiErrorResponse = {
  success: boolean;
  error: {
    code: string;
    message: string;
    path?: string;
    timestamp?: string;
    details?: Array<{
      field?: string;
      message: string;
    }>;
  };
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: T[];
  metadata: {
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  };
};
