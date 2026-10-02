export default function TranscriptLine({
  who,
  text,
  interim,
}: {
  who: 'user' | 'ai';
  text: string;
  interim?: boolean;
}) {
  return (
    <div className={`transcript-line ${who}${interim ? ' interim' : ''}`}>
      <div className="who">{who === 'user' ? 'You' : 'AI Receptionist'}</div>
      <div className="text">{text}</div>
    </div>
  );
}
