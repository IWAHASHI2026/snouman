import type { Metadata, Viewport } from 'next';
import { Noto_Sans_JP } from 'next/font/google';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import './globals.css';

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Snow Man Reminder',
  description: 'Snow Manの出演情報をリマインドするアプリ',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Snow Man Reminder',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#E8F4FD',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-[--font-noto-sans-jp] antialiased`}>
        <Header />
        <main className="main-content mx-auto max-w-3xl px-4 py-4">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
