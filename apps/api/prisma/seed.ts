/**
 * Development seed: fictional dramas, roles, dev-only accounts, ad placements (Google TEST
 * ad units) and inactive store products. Idempotent — safe to run repeatedly.
 * Refuses to run when NODE_ENV=production.
 */
import { existsSync } from 'node:fs';
import { AdFormat, Platform, PrismaClient } from '@prisma/client';
import { SYSTEM_ROLES, SystemRoleKey } from '../src/auth/permissions';

if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed development data with NODE_ENV=production');
  process.exit(1);
}

const prisma = new PrismaClient();
const DAY = 86_400_000;

const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];

const CATEGORIES = [
  { slug: 'romance', names: { en: 'Romance', hi: 'रोमांस' } },
  { slug: 'revenge', names: { en: 'Revenge', hi: 'बदला' } },
  { slug: 'family', names: { en: 'Family', hi: 'परिवार' } },
  { slug: 'thriller', names: { en: 'Thriller', hi: 'थ्रिलर' } },
  { slug: 'comedy', names: { en: 'Comedy', hi: 'कॉमेडी' } },
  { slug: 'fantasy', names: { en: 'Fantasy', hi: 'फ़ैंटेसी' } },
];

interface SeedDrama {
  slug: string;
  title: string;
  titleHi: string;
  synopsis: string;
  synopsisHi: string;
  categories: string[];
  episodes: number;
  freeEpisodes: number;
  publishedDaysAgo: number;
  trending: number;
  featured: boolean;
  cast: { name: string; role: string }[];
  tags: string[];
}

// All titles, characters and stories are fictional.
const DRAMAS: SeedDrama[] = [
  {
    slug: 'billionaires-secret-bride',
    title: "The Billionaire's Secret Bride",
    titleHi: 'अरबपति की गुप्त दुल्हन',
    synopsis: 'A café owner signs a one-year contract marriage with a reclusive tycoon — and discovers the contract hides a twenty-year-old family secret.',
    synopsisHi: 'एक कैफ़े मालिक एक रहस्यमय उद्योगपति से एक साल की कॉन्ट्रैक्ट शादी करती है — और पता चलता है कि उस कॉन्ट्रैक्ट में बीस साल पुराना पारिवारिक राज़ छिपा है।',
    categories: ['romance', 'family'],
    episodes: 20,
    freeEpisodes: 5,
    publishedDaysAgo: 3,
    trending: 98,
    featured: true,
    cast: [{ name: 'Aanya Kapoor', role: 'Meera' }, { name: 'Vikram Sethi', role: 'Arjun Malhotra' }],
    tags: ['contract-marriage', 'ceo', 'secret'],
  },
  {
    slug: 'return-of-the-disowned-heir',
    title: 'Return of the Disowned Heir',
    titleHi: 'बेदखल वारिस की वापसी',
    synopsis: 'Thrown out of his family business on his wedding day, Kabir returns five years later as the investor who holds their future.',
    synopsisHi: 'शादी के दिन परिवार के कारोबार से निकाला गया कबीर, पाँच साल बाद उसी कंपनी का भविष्य तय करने वाला निवेशक बनकर लौटता है।',
    categories: ['revenge', 'family'],
    episodes: 18,
    freeEpisodes: 5,
    publishedDaysAgo: 9,
    trending: 91,
    featured: true,
    cast: [{ name: 'Rohan Bhatia', role: 'Kabir' }, { name: 'Sana Mirza', role: 'Ritika' }],
    tags: ['revenge', 'business', 'comeback'],
  },
  {
    slug: 'midnight-at-banaras-ghat',
    title: 'Midnight at Banaras Ghat',
    titleHi: 'बनारस घाट पर आधी रात',
    synopsis: 'A journalist investigating a string of disappearances on the ghats finds that every clue leads back to her own childhood photograph.',
    synopsisHi: 'घाटों पर हो रही गुमशुदगियों की जाँच कर रही एक पत्रकार को हर सुराग़ अपनी ही बचपन की तस्वीर तक ले जाता है।',
    categories: ['thriller'],
    episodes: 12,
    freeEpisodes: 3,
    publishedDaysAgo: 20,
    trending: 75,
    featured: false,
    cast: [{ name: 'Ishita Rao', role: 'Naina' }, { name: 'Dev Arora', role: 'Inspector Shukla' }],
    tags: ['mystery', 'varanasi'],
  },
  {
    slug: 'my-boss-is-my-ex',
    title: 'My Boss Is My Ex',
    titleHi: 'मेरा बॉस, मेरा एक्स',
    synopsis: 'Priya lands her dream job — on the same day her college ex walks in as the new CEO.',
    synopsisHi: 'प्रिया को सपनों की नौकरी मिलती है — उसी दिन उसका कॉलेज वाला एक्स नया सीईओ बनकर आ जाता है।',
    categories: ['romance', 'comedy'],
    episodes: 16,
    freeEpisodes: 5,
    publishedDaysAgo: 1,
    trending: 88,
    featured: true,
    cast: [{ name: 'Tara Singh', role: 'Priya' }, { name: 'Neil Khanna', role: 'Aditya' }],
    tags: ['office', 'second-chance'],
  },
  {
    slug: 'twin-sisters-revenge',
    title: "The Twin Sisters' Revenge",
    titleHi: 'जुड़वां बहनों का बदला',
    synopsis: 'When one twin is framed for a crime she never committed, the other takes her place to bring down the family that betrayed them.',
    synopsisHi: 'जब एक जुड़वां बहन को झूठे केस में फँसाया जाता है, तो दूसरी उसकी जगह लेकर धोखा देने वाले परिवार को सबक सिखाती है।',
    categories: ['revenge', 'family', 'thriller'],
    episodes: 15,
    freeEpisodes: 5,
    publishedDaysAgo: 30,
    trending: 64,
    featured: false,
    cast: [{ name: 'Kavya Menon', role: 'Riya / Siya' }],
    tags: ['twins', 'identity-swap'],
  },
  {
    slug: 'last-raja-of-devgarh',
    title: 'The Last Raja of Devgarh',
    titleHi: 'देवगढ़ का आखिरी राजा',
    synopsis: 'A delivery rider learns he is the heir of a forgotten kingdom — and that its ancient guardian has been waiting for him.',
    synopsisHi: 'एक डिलीवरी राइडर को पता चलता है कि वह एक भूले-बिसरे राज्य का वारिस है — और उसका प्राचीन रक्षक उसका इंतज़ार कर रहा है।',
    categories: ['fantasy'],
    episodes: 10,
    freeEpisodes: 5,
    publishedDaysAgo: 45,
    trending: 52,
    featured: false,
    cast: [{ name: 'Aman Verma', role: 'Raghav' }],
    tags: ['kingdom', 'destiny'],
  },
];

const DEV_USERS: { key: string; email: string; role?: SystemRoleKey; name: string; coins?: number }[] = [
  { key: 'dev-owner', email: 'owner@dev.local', role: 'OWNER', name: 'Dev Owner' },
  { key: 'dev-content', email: 'content@dev.local', role: 'CONTENT_MANAGER', name: 'Dev Content' },
  { key: 'dev-ads', email: 'ads@dev.local', role: 'ADS_MANAGER', name: 'Dev Ads' },
  { key: 'dev-support', email: 'support@dev.local', role: 'SUPPORT_AGENT', name: 'Dev Support' },
  { key: 'dev-viewer', email: 'viewer@dev.local', name: 'Dev Viewer', coins: 100 },
];

// Google's official TEST ad units — https://developers.google.com/admob/android/test-ads
const TEST_AD_UNITS: Record<'REWARDED' | 'INTERSTITIAL' | 'NATIVE', Record<'ANDROID' | 'IOS', string>> = {
  REWARDED: { ANDROID: 'ca-app-pub-3940256099942544/5224354917', IOS: 'ca-app-pub-3940256099942544/1712485313' },
  INTERSTITIAL: { ANDROID: 'ca-app-pub-3940256099942544/1033173712', IOS: 'ca-app-pub-3940256099942544/4411468910' },
  NATIVE: { ANDROID: 'ca-app-pub-3940256099942544/2247696110', IOS: 'ca-app-pub-3940256099942544/3986624511' },
};

const PLACEMENTS: {
  key: string;
  name: string;
  format: AdFormat;
  rules: { minEpisodesBetween?: number; minSecondsBetween?: number; maxPerUserPerDay?: number; rewardCoins?: number };
}[] = [
  { key: 'episode_unlock_rewarded', name: 'Unlock episode (rewarded)', format: 'REWARDED', rules: { maxPerUserPerDay: 20 } },
  { key: 'earn_coins_rewarded', name: 'Earn coins (rewarded)', format: 'REWARDED', rules: { maxPerUserPerDay: 10, rewardCoins: 10 } },
  { key: 'between_episodes_interstitial', name: 'Between episodes', format: 'INTERSTITIAL', rules: { minEpisodesBetween: 4, minSecondsBetween: 300, maxPerUserPerDay: 12 } },
  { key: 'catalog_native', name: 'Catalog native', format: 'NATIVE', rules: {} },
  { key: 'home_sponsored_card', name: 'Home sponsored card', format: 'SPONSORED_CARD', rules: { maxPerUserPerDay: 20 } },
];

const PRODUCTS = [
  { sku: 'coins_100', kind: 'COIN_PACK' as const, title: '100 Coins', coins: 100, bonusCoins: 0, sortOrder: 1 },
  { sku: 'coins_500', kind: 'COIN_PACK' as const, title: '500 Coins', coins: 500, bonusCoins: 50, sortOrder: 2 },
  { sku: 'vip_weekly', kind: 'SUBSCRIPTION' as const, title: 'VIP Weekly', periodDays: 7, adFree: true, sortOrder: 3 },
  { sku: 'vip_monthly', kind: 'SUBSCRIPTION' as const, title: 'VIP Monthly', periodDays: 30, adFree: true, sortOrder: 4 },
];

async function seedReferenceData() {
  for (const l of LANGUAGES) {
    await prisma.language.upsert({ where: { code: l.code }, create: l, update: l });
  }
  for (const [i, c] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: { ...c, sortOrder: i },
      update: { names: c.names, sortOrder: i },
    });
  }
  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const permissions = [...def.permissions];
    await prisma.role.upsert({
      where: { key },
      create: { key, name: def.name, permissions, isSystem: true },
      update: { name: def.name, permissions, isSystem: true },
    });
  }
}

async function seedDramas() {
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  const now = Date.now();

  for (const d of DRAMAS) {
    const publishedAt = new Date(now - d.publishedDaysAgo * DAY);
    const data = {
      title: d.title,
      synopsis: d.synopsis,
      primaryLanguageCode: 'en',
      posterKey: `https://picsum.photos/seed/${d.slug}/600/900`,
      coverKey: `https://picsum.photos/seed/${d.slug}-cover/900/1600`,
      cast: d.cast,
      tags: d.tags,
      status: 'PUBLISHED' as const,
      freeEpisodeCount: d.freeEpisodes,
      defaultUnlockCoins: 30,
      isFeatured: d.featured,
      trendingScore: d.trending,
      episodeCount: d.episodes,
      viewCount: BigInt(Math.round(d.trending * 1234)),
      publishedAt,
    };
    const drama = await prisma.drama.upsert({ where: { slug: d.slug }, create: { slug: d.slug, ...data }, update: data });

    await prisma.dramaTranslation.upsert({
      where: { dramaId_languageCode: { dramaId: drama.id, languageCode: 'hi' } },
      create: { dramaId: drama.id, languageCode: 'hi', title: d.titleHi, synopsis: d.synopsisHi },
      update: { title: d.titleHi, synopsis: d.synopsisHi },
    });

    await prisma.dramaCategory.deleteMany({ where: { dramaId: drama.id } });
    await prisma.dramaCategory.createMany({
      data: d.categories.map((slug) => ({ dramaId: drama.id, categoryId: categories.get(slug)! })),
    });

    const season = await prisma.season.upsert({
      where: { dramaId_number: { dramaId: drama.id, number: 1 } },
      create: { dramaId: drama.id, number: 1 },
      update: {},
    });

    for (let n = 1; n <= d.episodes; n++) {
      const episode = {
        seasonId: season.id,
        title: `Episode ${n}`,
        durationSeconds: 60 + ((n * 37) % 60),
        access: n <= d.freeEpisodes ? ('FREE' as const) : ('PREMIUM' as const),
        status: 'PUBLISHED' as const,
        publishedAt,
        thumbnailKey: `https://picsum.photos/seed/${d.slug}-ep${n}/360/640`,
      };
      await prisma.episode.upsert({
        where: { dramaId_number: { dramaId: drama.id, number: n } },
        create: { dramaId: drama.id, number: n, ...episode },
        update: episode,
      });
    }
  }
}

async function seedUsers() {
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.key, r.id]));
  for (const u of DEV_USERS) {
    const user = await prisma.user.upsert({
      where: { authProviderId: u.key },
      create: {
        authProviderId: u.key,
        email: u.email,
        profile: { create: { displayName: u.name } },
        wallet: { create: {} },
      },
      update: {},
    });
    if (u.role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: roles.get(u.role)! } },
        create: { userId: user.id, roleId: roles.get(u.role)! },
        update: {},
      });
    }
    if (u.coins) {
      const key = `seed:welcome:${user.id}`;
      const exists = await prisma.walletTransaction.findUnique({ where: { idempotencyKey: key } });
      if (!exists) {
        await prisma.$transaction(async (tx) => {
          const wallet = await tx.userWallet.update({
            where: { userId: user.id },
            data: { balance: { increment: u.coins! }, version: { increment: 1 } },
          });
          await tx.walletTransaction.create({
            data: { userId: user.id, type: 'BONUS', amount: u.coins!, balanceAfter: wallet.balance, idempotencyKey: key, note: 'Dev seed welcome coins' },
          });
        });
      }
    }
  }
}

async function seedAds() {
  for (const p of PLACEMENTS) {
    const placement = await prisma.adPlacement.upsert({
      where: { key: p.key },
      create: { key: p.key, name: p.name, format: p.format },
      update: { name: p.name, format: p.format },
    });
    for (const platform of ['ANDROID', 'IOS'] as Platform[]) {
      const isNetwork = p.format === 'REWARDED' || p.format === 'INTERSTITIAL' || p.format === 'NATIVE';
      const source = isNetwork ? 'ADMOB' : 'DIRECT';
      const adUnitId = isNetwork ? TEST_AD_UNITS[p.format as keyof typeof TEST_AD_UNITS][platform as 'ANDROID' | 'IOS'] : null;
      await prisma.adConfiguration.upsert({
        where: { placementId_platform_source: { placementId: placement.id, platform, source } },
        create: { placementId: placement.id, platform, source, adUnitId, ...p.rules, hideForSubscribers: p.format !== 'REWARDED' },
        update: { adUnitId, ...p.rules },
      });
    }
  }
}

async function seedProducts() {
  for (const p of PRODUCTS) {
    // Inactive until PAYMENTS_ENABLED and store listings exist.
    await prisma.product.upsert({ where: { sku: p.sku }, create: { ...p, isActive: false }, update: { title: p.title } });
  }
}

async function main() {
  await seedReferenceData();
  await seedDramas();
  await seedUsers();
  await seedAds();
  await seedProducts();
  const [dramas, episodes, users] = await Promise.all([prisma.drama.count(), prisma.episode.count(), prisma.user.count()]);
  console.log(`Seed complete: ${dramas} dramas, ${episodes} episodes, ${users} users`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
