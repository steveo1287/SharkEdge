SharkEdge Prisma fix for Vercel build error P1012

Problem:
Event has this relation field:
  explanationSnapshots EdgeExplanationSnapshot[]

But EdgeExplanationSnapshot was missing the opposite Prisma relation field.

Apply this exact fix in:
  frontend/prisma/schema.prisma

What to change:
Add this line inside model EdgeExplanationSnapshot, directly under the existing edgeSignal relation:

  event                Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)

Files included:
- schema.patch.diff : minimal diff
- frontend/prisma/EdgeExplanationSnapshot.fixed.prisma : full replacement block for the broken model

After patching:
1. Commit the change
2. Push to GitHub
3. Redeploy on Vercel

Expected outcome:
This should clear the Prisma schema validation error:
  Error validating field `explanationSnapshots` in model `Event`
