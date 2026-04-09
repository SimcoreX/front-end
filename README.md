This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Create a `.env.local` file at the project root:

```bash
NEXT_PUBLIC_TWELVE_DATA_API_KEY=your_twelve_data_key
NEXT_PUBLIC_GNEWS_API_KEY=your_gnews_key
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

- `NEXT_PUBLIC_TWELVE_DATA_API_KEY`: enables real market candles in the Markets page.
- `NEXT_PUBLIC_GNEWS_API_KEY`: enables live global financial news in the News page (10 items per page).
- `NEXT_PUBLIC_API_BASE_URL`: backend base URL used to send trade operations (`POST /trades/operations`).

If the Twelve Data key is missing or rate-limited, the Markets page automatically falls back to mock candles for frontend testing.
If the GNews key is missing or unavailable, the News page automatically falls back to local mock news with pagination.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
