interface EventDetailsProps {
  startsAt: string | null;
  endsAt: string | null;
  description: string | null;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function EventDetails({
  startsAt,
  endsAt,
  description,
}: EventDetailsProps) {
  // Parse location from description (stored as "📍 location")
  const location = description?.replace("📍 ", "") || null;

  return (
    <div className="bg-white/5 border border-grapple-border rounded-2xl p-4 mb-6 space-y-1">
      {startsAt && (
        <div className="flex items-center py-2">
          <div className="w-10 h-10 rounded-full bg-grapple-primaryMuted flex items-center justify-center mr-4 flex-shrink-0">
            <svg
              className="w-5 h-5 text-grapple-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-400">Date</p>
            <p className="text-white font-medium">{formatDate(startsAt)}</p>
          </div>
        </div>
      )}

      {startsAt && (
        <div className="flex items-center py-2">
          <div className="w-10 h-10 rounded-full bg-grapple-primaryMuted flex items-center justify-center mr-4 flex-shrink-0">
            <svg
              className="w-5 h-5 text-grapple-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-400">Time</p>
            <p className="text-white font-medium">
              {formatTime(startsAt)}
              {endsAt && ` – ${formatTime(endsAt)}`}
            </p>
          </div>
        </div>
      )}

      {location && (
        <div className="flex items-center py-2">
          <div className="w-10 h-10 rounded-full bg-grapple-primaryMuted flex items-center justify-center mr-4 flex-shrink-0">
            <svg
              className="w-5 h-5 text-grapple-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-400">Location</p>
            <p className="text-white font-medium">{location}</p>
          </div>
        </div>
      )}
    </div>
  );
}
