-- Re-add RESERVED to UnitStatus: a box whose rental starts in the future
-- (booked ahead of time) is now "Réservé" until the start date arrives,
-- distinct from AVAILABLE and OCCUPIED.
ALTER TYPE "UnitStatus" ADD VALUE 'RESERVED';
