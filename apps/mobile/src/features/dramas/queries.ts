import { useQuery } from '@tanstack/react-query';
import { Api } from '@/lib/api/endpoints';
import type { Episode } from '@/lib/api/types';
import { qk } from '@/lib/query';

/** All episodes of a drama (dramas are short: a couple of pages at most). */
export function useAllEpisodes(dramaId: string) {
  return useQuery({
    queryKey: qk.episodes(dramaId),
    queryFn: async () => {
      const all: Episode[] = [];
      let cursor: string | undefined;
      do {
        const page = await Api.episodes(dramaId, cursor);
        all.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor && all.length < 1000);
      return all;
    },
  });
}

export function useDrama(dramaId: string) {
  return useQuery({ queryKey: qk.drama(dramaId), queryFn: () => Api.drama(dramaId) });
}
