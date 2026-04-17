import type { Metadata } from 'next';
import { GalleryPage } from './GalleryPage';

export const metadata: Metadata = {
  title: 'gallery — pixel-sort',
  description: 'Community pixel sort results',
};

export default function Page() {
  return <GalleryPage />;
}
