import React from 'react';
import { ErrorBanner } from './ErrorBanner';
import { NoticeBanner } from './NoticeBanner';

interface AppBannersProps {
  error: string | null;
  notice: string | null;
  onDismissError: () => void;
  onDismissNotice: () => void;
}

/** Error and notice banners shared by every screen. */
export function AppBanners({
  error,
  notice,
  onDismissError,
  onDismissNotice,
}: AppBannersProps) {
  return (
    <>
      <ErrorBanner message={error} onDismiss={onDismissError} />
      <NoticeBanner message={notice} onDismiss={onDismissNotice} />
    </>
  );
}
