export const statusLabels: Record<string, string> = {
  AVAILABLE: "Libre",
  RESERVED: "Réservé",
  OCCUPIED: "Occupé",
  ACTIVE: "Actif",
  ENDED: "Terminé",
  CANCELLED: "Annulé",
  ISSUED: "Émise",
  DUE_SOON: "Échéance proche",
  PAID: "Payée",
  OVERDUE: "En retard",
  DRAFT: "Brouillon",
  VOID: "Annulée",
  SCHEDULED: "Programmé",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  SYSTEM: "Système",
  PAYMENT_DUE: "Paiement attendu",
  PAYMENT_OVERDUE: "Impayé",
  RENTAL_ENDING: "Sortie proche",
  LOADING_TODAY: "Chargement",
  PARKING_OVERDUE: "Stationnement à facturer"
};

export function labelStatus(status: string) {
  return statusLabels[status] ?? status;
}
