export default function NotFound() {
  return (
    <div className="min-h-screen bg-grapple-bg flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-6xl mb-4">🤷</div>
        <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
        <p className="text-gray-400 mb-6">
          This page doesn't exist. If you're looking for an event, make sure you have the right link.
        </p>
        <a
          href="https://apps.apple.com/app/grapple"
          className="inline-block px-6 py-3 bg-grapple-primary text-white rounded-xl font-semibold hover:bg-grapple-primary/80 transition-colors"
        >
          Get the Grapple App
        </a>
      </div>
    </div>
  );
}
