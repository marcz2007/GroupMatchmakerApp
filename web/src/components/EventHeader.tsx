interface EventHeaderProps {
  title: string;
  groupName: string | null;
  isExpired: boolean;
}

export default function EventHeader({
  title,
  groupName,
  isExpired,
}: EventHeaderProps) {
  return (
    <div className="text-center mb-8">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-grapple-primary to-grapple-secondary mx-auto mb-4 flex items-center justify-center text-4xl">
        🎉
      </div>
      <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
      {groupName && (
        <p className="text-gray-400 text-base">{groupName}</p>
      )}
      {isExpired ? (
        <span className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-white/5 text-gray-400 text-sm">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
          Event ended
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-grapple-primaryMuted border border-grapple-primaryBorder text-white text-sm">
          <span className="w-2 h-2 rounded-full bg-grapple-success" />
          Active event
        </span>
      )}
    </div>
  );
}
