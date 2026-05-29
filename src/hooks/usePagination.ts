import { useState, useEffect, useMemo } from 'react';

interface UsePaginationProps {
  defaultPageSize?: number;
  totalRecords?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export const usePagination = ({
  defaultPageSize = 25,
  totalRecords = 0,
  onPageChange,
  onPageSizeChange,
}: UsePaginationProps = {}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(totalRecords);

  // Calculate derived values
  const totalPages = useMemo(() => {
    return Math.ceil(total / pageSize) || 1;
  }, [total, pageSize]);

  const startRecord = useMemo(() => {
    return total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  }, [currentPage, pageSize, total]);

  const endRecord = useMemo(() => {
    const end = currentPage * pageSize;
    return Math.min(end, total);
  }, [currentPage, pageSize, total]);

  const hasNextPage = useMemo(() => {
    return currentPage < totalPages;
  }, [currentPage, totalPages]);

  const hasPrevPage = useMemo(() => {
    return currentPage > 1;
  }, [currentPage]);

  // Page change handler
  const setPage = (page: number) => {
    const newPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(newPage);
    onPageChange?.(newPage);
  };

  // Page size change handler
  const changePageSize = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
    onPageSizeChange?.(newSize);
  };

  // Navigation helpers
  const goToFirstPage = () => setPage(1);
  const goToLastPage = () => setPage(totalPages);
  const goToNextPage = () => setPage(currentPage + 1);
  const goToPrevPage = () => setPage(currentPage - 1);

  // Reset pagination
  const reset = () => {
    setCurrentPage(1);
    setPageSize(defaultPageSize);
  };

  // Update total when prop changes
  useEffect(() => {
    setTotal(totalRecords);
  }, [totalRecords]);

  // Ensure current page is valid when total changes
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  return {
    currentPage,
    pageSize,
    totalRecords: total,
    totalPages,
    startRecord,
    endRecord,
    hasNextPage,
    hasPrevPage,
    setPage,
    setPageSize: changePageSize,
    setTotalRecords: setTotal,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPrevPage,
    reset,
  };
};
