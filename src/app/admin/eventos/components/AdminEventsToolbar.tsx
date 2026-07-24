"use client";

import { memo, type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import type { AdminViewFilter, EventFilterStatus } from "../AdminEventsEditor";

export type AdminEventsToolbarProps = {
  appliedSearch: string;
  status: EventFilterStatus;
  viewFilter: AdminViewFilter;
  eventCount: number;
  onSearch: (search: string) => void;
  onRefreshSearch: (search: string) => void;
  onStatusChange: (status: EventFilterStatus) => void;
  onViewFilterChange: (viewFilter: AdminViewFilter) => void;
};

function AdminEventsToolbarComponent({
  appliedSearch,
  status,
  viewFilter,
  eventCount,
  onSearch,
  onRefreshSearch,
  onStatusChange,
  onViewFilterChange,
}: AdminEventsToolbarProps) {
  const [search, setSearch] = useState(appliedSearch);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextSearch = search.trim();
    if (nextSearch === appliedSearch) {
      onRefreshSearch(nextSearch);
      return;
    }
    onSearch(nextSearch);
  }, [appliedSearch, onRefreshSearch, onSearch, search]);

  const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);

  const handleStatusChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    onStatusChange(event.target.value as EventFilterStatus);
  }, [onStatusChange]);

  const showTickets = useCallback(() => onViewFilterChange("tickets"), [onViewFilterChange]);
  const showCombos = useCallback(() => onViewFilterChange("combos"), [onViewFilterChange]);
  const showAll = useCallback(() => onViewFilterChange("all"), [onViewFilterChange]);

  return (
    <section className="admin-events-toolbar" aria-label="Filtros" data-event-count={eventCount}>
      <form onSubmit={handleSubmit}>
        <input
          value={search}
          onChange={handleSearchChange}
          placeholder="Buscar por nome, artista ou cidade"
        />
        <button type="submit">Buscar</button>
      </form>
      <div className="admin-view-filter" aria-label="Filtro de visualização">
        <button type="button" className={viewFilter === "tickets" ? "is-active" : ""} onClick={showTickets}>Ver ingressos</button>
        <button type="button" className={viewFilter === "combos" ? "is-active" : ""} onClick={showCombos}>Ver combo</button>
        <button type="button" className={viewFilter === "all" ? "is-active" : ""} onClick={showAll}>Ver tudo</button>
      </div>
      <select value={status} onChange={handleStatusChange}>
        <option value="all">Todos</option>
        <option value="draft">Rascunhos</option>
        <option value="paused">Pausados</option>
        <option value="published">Publicados</option>
        <option value="cancelled">Cancelados</option>
        <option value="finished">Finalizados</option>
      </select>
    </section>
  );
}

const AdminEventsToolbar = memo(AdminEventsToolbarComponent);

export default AdminEventsToolbar;
