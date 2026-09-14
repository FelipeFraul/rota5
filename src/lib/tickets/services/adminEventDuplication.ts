export type DuplicatedAdminEventSource = {
  title: string;
  artist_name: string;
  artist_icon: string | null;
  description: string | null;
  city: string;
  state: string;
  image_url: string | null;
};

export function buildDuplicatedAdminEventPayload({
  sourceEvent,
  venueId,
}: {
  sourceEvent: DuplicatedAdminEventSource;
  venueId: string | null;
}) {
  const duplicatedTitle = `${sourceEvent.title} - CÓPIA`;

  return {
    title: duplicatedTitle,
    artist_name: duplicatedTitle,
    artist_icon: sourceEvent.artist_icon ?? "🎤",
    description: sourceEvent.description,
    city: sourceEvent.city,
    state: sourceEvent.state,
    image_url: sourceEvent.image_url,
    venue_id: venueId,
    status: "draft" as const,
  };
}
