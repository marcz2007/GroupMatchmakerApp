interface DownloadCTAProps {
  eventTitle: string;
}

export default function DownloadCTA({ eventTitle }: DownloadCTAProps) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-grapple-success/20 mx-auto mb-4 flex items-center justify-center">
        <svg className="w-8 h-8 text-grapple-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">You're in!</h2>
      <p className="text-gray-400 mb-8">{eventTitle}</p>

      <div className="bg-grapple-surface border border-grapple-border rounded-2xl p-6">
        <p className="text-white font-semibold mb-1">Get the Grapple app</p>
        <p className="text-gray-400 text-sm mb-4">
          Chat with the group, manage events, and find the best time to meet.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="https://apps.apple.com/app/grapple"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            App Store
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.grapple"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302-2.302 2.302-2.625-2.302 2.625-2.302zM5.864 2.658L16.8 9.99l-2.302 2.302L5.864 3.658z" />
            </svg>
            Google Play
          </a>
        </div>
      </div>
    </div>
  );
}
