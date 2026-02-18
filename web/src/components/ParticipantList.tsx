interface ParticipantListProps {
  names: string[];
  count: number;
}

export default function ParticipantList({ names, count }: ParticipantListProps) {
  if (count === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-white font-semibold text-base mb-3">
        Going ({count})
      </h2>
      <div className="flex flex-wrap gap-2">
        {names.map((name, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 border border-grapple-border rounded-full text-sm text-white"
          >
            <span className="w-7 h-7 rounded-full bg-grapple-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {name.charAt(0).toUpperCase()}
            </span>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
