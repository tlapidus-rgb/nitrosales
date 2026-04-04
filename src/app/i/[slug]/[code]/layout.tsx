// Public layout — no sidebar, no auth required
export default function PublicInfluencerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
