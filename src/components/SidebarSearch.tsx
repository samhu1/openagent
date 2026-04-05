import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import { Search, MessageSquare, Hash, X, CalendarDays } from "lucide-react";
import type { SearchMessageResult, SearchSessionResult } from "@/types";

interface SidebarSearchProps {
  projectIds: string[];
  onNavigateToMessage: (sessionId: string, messageId: string) => void;
  onSelectSession: (sessionId: string) => void;
}

export const SidebarSearch = memo(function SidebarSearch({
  projectIds,
  onNavigateToMessage,
  onSelectSession,
}: SidebarSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [messageResults, setMessageResults] = useState<SearchMessageResult[]>([]);
  const [sessionResults, setSessionResults] = useState<SearchSessionResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim() || projectIds.length === 0) {
        setMessageResults([]);
        setSessionResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const results = await window.clientCore.sessions.search(projectIds, q.trim());
        setMessageResults(results.messageResults);
        setSessionResults(results.sessionResults);
      } catch {
        setMessageResults([]);
        setSessionResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [projectIds],
  );

  // Debounced search
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) {
      setMessageResults([]);
      setSessionResults([]);
      return;
    }
    timerRef.current = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timerRef.current);
  }, [query, doSearch]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
      setDateFrom("");
      setDateTo("");
      inputRef.current?.blur();
    }
  };

  // Client-side date filtering applied on top of keyword results
  const filteredSessionResults = useMemo(() => {
    if (!dateFrom && !dateTo) return sessionResults;
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toMs = dateTo ? new Date(dateTo).getTime() + 86_400_000 - 1 : Infinity;
    return sessionResults.filter((r) => r.createdAt >= fromMs && r.createdAt <= toMs);
  }, [sessionResults, dateFrom, dateTo]);

  const filteredMessageResults = useMemo(() => {
    if (!dateFrom && !dateTo) return messageResults;
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toMs = dateTo ? new Date(dateTo).getTime() + 86_400_000 - 1 : Infinity;
    return messageResults.filter((r) => r.timestamp >= fromMs && r.timestamp <= toMs);
  }, [messageResults, dateFrom, dateTo]);

  const hasDateFilter = Boolean(dateFrom || dateTo);
  const hasResults = filteredMessageResults.length > 0 || filteredSessionResults.length > 0;
  const dateFilteredAllOut =
    hasDateFilter && !isSearching && (messageResults.length > 0 || sessionResults.length > 0) && !hasResults;
  const showDropdown = isOpen && query.trim().length > 0;

  const clearDateFilter = () => {
    setDateFrom("");
    setDateTo("");
  };

  const highlightMatch = (text: string, q: string) => {
    const lowerText = text.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerText.indexOf(lowerQ);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-500/30 text-inherit rounded-sm px-0.5">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div ref={containerRef} className="relative no-drag px-2 pb-1">
      <div className="relative">
        <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/30" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search chats..."
          className="w-full rounded-md bg-sidebar-accent/50 py-1.5 pe-7 ps-8 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/30 outline-none transition-colors focus:bg-sidebar-accent"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setDateFrom("");
              setDateTo("");
              setIsOpen(false);
            }}
            className="absolute end-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          className="absolute inset-x-2 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-sidebar-border bg-popover p-1 shadow-lg"
          role="region"
          aria-label="Search results"
        >
          {/* Date filter row */}
          <div className="flex items-center gap-1.5 border-b border-sidebar-border/50 px-2 py-1.5 mb-1">
            <CalendarDays className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              aria-label="Filter from date"
              className="flex-1 rounded bg-transparent text-[11px] text-muted-foreground outline-none focus:text-foreground [color-scheme:dark] cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground/50">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              aria-label="Filter to date"
              className="flex-1 rounded bg-transparent text-[11px] text-muted-foreground outline-none focus:text-foreground [color-scheme:dark] cursor-pointer"
            />
            {hasDateFilter && (
              <button
                onClick={clearDateFilter}
                aria-label="Clear date filter"
                className="text-muted-foreground/50 hover:text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {isSearching && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Searching...</p>
          )}

          {!isSearching && dateFilteredAllOut && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No results in the selected date range
            </p>
          )}

          {!isSearching && !hasResults && !dateFilteredAllOut && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No results found</p>
          )}

          {/* Session results */}
          {filteredSessionResults.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Chats
              </p>
              {filteredSessionResults.map((r) => (
                <button
                  key={r.sessionId}
                  onClick={() => {
                    onSelectSession(r.sessionId);
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent"
                >
                  <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">
                    {highlightMatch(r.title, query)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Message results */}
          {filteredMessageResults.length > 0 && (
            <div>
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Messages
              </p>
              {filteredMessageResults.map((r, i) => (
                <button
                  key={`${r.sessionId}-${r.messageId}-${i}`}
                  onClick={() => {
                    onNavigateToMessage(r.sessionId, r.messageId);
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-start hover:bg-accent"
                >
                  <span className="text-sm wrap-break-word line-clamp-2">
                    {highlightMatch(r.snippet, query)}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate">
                    <MessageSquare className="me-1 inline h-3 w-3" />
                    {r.sessionTitle}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
