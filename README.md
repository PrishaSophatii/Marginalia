# Marginalia

A free AI reading companion for research papers, textbooks and PDFs. Highlight any passage, ask Claude to explain it, and keep every answer as a note beside the text.

- **Next.js 15** (App Router) for the public site, guides and the reader
- **Supabase** for sign-up/login (email + Google), the library database and original PDF storage
- **Bring your own key**: questions go from the reader's browser straight to Anthropic with their own API key, which is kept only in their browser
- **SEO**: static public pages, per-page titles and descriptions, canonical URLs, sitemap, robots.txt, Open Graph image and structured data
- **Google AdSense** slots on the landing page, guides and library, off until you add your AdSense IDs

The reader itself lives in `public/reader/` (the same code as the Marginalia artifact). `components/ReaderHost.tsx` gives it a document store, file storage and Claude.

## Set it up (about 30 minutes)

### 1. Supabase (database and login)
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste everything in `supabase/schema.sql`, and press **Run**. This creates the `docs` table, the private `pdfs` bucket and the rules that keep each person's data private.
3. **Authentication → URL Configuration**: set **Site URL** to your domain (e.g. `https://marginalia.app`) and add `https://YOUR-DOMAIN/auth/callback` and `http://localhost:3000/auth/callback` to **Redirect URLs**.
4. Optional, Google sign-in: **Authentication → Providers → Google**. Follow Supabase's steps to create a Google OAuth client and paste its ID and secret.
5. **Project Settings → API**: copy the Project URL and the `anon` public key.

### 2. Run it locally
```bash
cp .env.example .env.local   # then fill in the Supabase values
npm install
npm run dev                  # http://localhost:3000
```

### 3. Deploy on Vercel
1. Import this GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Add the variables from `.env.example` under **Settings → Environment Variables** (at minimum `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Deploy, then add your domain under **Settings → Domains**. Set `NEXT_PUBLIC_SITE_URL` to that domain and redeploy.

### 4. Get found on Google
1. Add your domain at [Google Search Console](https://search.google.com/search-console) using the **URL prefix** method and the **HTML tag** option.
2. Copy the `content="..."` value into `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` on Vercel, redeploy, and press **Verify**.
3. Under **Sitemaps**, submit `sitemap.xml`. Use **URL Inspection → Request indexing** on the home page to speed things up.

New guides in `lib/guides.ts` are added to the sitemap automatically. Regular, useful articles are the biggest lever for search traffic.

### 5. Ads (Google AdSense)
1. Apply at [adsense.google.com](https://adsense.google.com) with your live domain. Approval needs real content and a privacy page, both included.
2. Once approved, put your publisher ID (`ca-pub-…`) in `NEXT_PUBLIC_ADSENSE_CLIENT`, create three display ad units, put their slot IDs in the `NEXT_PUBLIC_ADSENSE_SLOT_*` variables, and redeploy.
3. AdSense will ask for an `ads.txt` file. Create `public/ads.txt` with the line it gives you.

## Costs
Vercel and Supabase are free to start. Readers pay Anthropic for their own questions. Your only required cost is a domain name.
