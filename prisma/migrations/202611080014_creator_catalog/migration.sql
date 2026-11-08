CREATE TABLE "CatalogGame" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('challenge', 'playthrough')),
    "status" TEXT NOT NULL CHECK ("status" IN ('playing', 'completed', 'upcoming')),
    "descriptionEn" TEXT NOT NULL,
    "descriptionEs" TEXT NOT NULL,
    "cover" TEXT NOT NULL,
    "coverScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "coverOutline" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogGame_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CatalogLogo" (
    "gameId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    CONSTRAINT "CatalogLogo_pkey" PRIMARY KEY ("gameId"),
    CONSTRAINT "CatalogLogo_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "CatalogGame"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
