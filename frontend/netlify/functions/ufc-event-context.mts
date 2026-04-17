import type { Config } from '@netlify/functions';

import { prisma } from '../../lib/db/prisma';
import { buildUfcEventContext } from '../../services/modeling/ufc-event-context-service';

export default async (req: Request) => {
  const url = new URL(req.url);
  const eventId = url.searchParams.get('eventId');
  if (!eventId) {
    return new Response(JSON.stringify({ error: 'Missing eventId query param.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: {
        include: { competitor: true }
      }
    }
  });
  if (!event) {
    return new Response(JSON.stringify({ error: 'Event not found.' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  }

  const context = buildUfcEventContext({
    eventId: event.id,
    name: event.name,
    metadataJson: event.metadataJson,
    participants: event.participants.map((participant) => ({
      role: participant.role,
      competitor: {
        id: participant.competitor.id,
        name: participant.competitor.name,
        metadataJson: participant.competitor.metadataJson
      }
    }))
  });

  return new Response(JSON.stringify(context), {
    headers: { 'content-type': 'application/json' }
  });
};

export const config: Config = {
  path: '/api/ufc/event-context'
};
