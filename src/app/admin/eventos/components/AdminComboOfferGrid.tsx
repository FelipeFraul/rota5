"use client";

import { memo } from "react";
import AdminComboOfferCard, { type AdminComboOfferCardProps } from "./AdminComboOfferCard";

export type AdminComboOfferCardItem = Omit<
  AdminComboOfferCardProps,
  "actionPending" | "onEdit" | "onDuplicate" | "onDelete"
>;

export type AdminComboOfferGridProps = {
  offers: AdminComboOfferCardItem[];
  loading: boolean;
  loaded: boolean;
  actionId: string | null;
  onEdit: (offerId: string) => void;
  onDuplicate: (offerId: string) => void;
  onDelete: (offerId: string) => void;
};

function AdminComboOfferGridComponent({
  offers,
  loading,
  loaded,
  actionId,
  onEdit,
  onDuplicate,
  onDelete,
}: AdminComboOfferGridProps) {
  return (
    <section className="admin-combo-offers-section" aria-label="Ofertas e combos">
      <div className="admin-events-grid admin-combo-offers-grid">
        {loading ? <p className="admin-events-empty">Carregando combos...</p> : null}
        {!loading && loaded && offers.length === 0 ? <p className="admin-events-empty">Nenhum combo encontrado.</p> : null}
        {offers.map((offer) => (
          <AdminComboOfferCard
            key={offer.offerId}
            {...offer}
            actionPending={actionId === offer.offerId}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

const AdminComboOfferGrid = memo(AdminComboOfferGridComponent);

export default AdminComboOfferGrid;
