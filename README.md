 # Pokemon TCG Investment Tracker

A sophisticated web application designed to help collectors and investors track and analyze the value of Pokémon TCG cards. This tool leverages the Pokemon TCG API and simulated PSA population data to identify potential investment opportunities.

![Pokemon TCG Investment Tracker Screenshot](https://user-images.githubusercontent.com/8692289/191393695-1e0f682f-1a98-4b7c-86d6-2c5e5c7b3e4f.png)
*(Note: This is a placeholder screenshot. You can replace it with one from your actual application.)*

## Features

- **Powerful Search:** Quickly find any Pokémon card by name.
- **Advanced Sorting & Filtering:** Sort cards by price, name, release date, rarity, and investment score. Filter for specific criteria like undervalued cards, low PSA population, high return potential, and bullish market trends.
- **Detailed Card View:** Click on a card to see comprehensive details, including multiple price points, set information, and rarity.
- **In-depth Investment Analysis:** For select cards, view detailed investment data, including:
  - **PSA Population:** See the number of cards graded at different PSA levels.
  - **Price History:** (Simulated) Historical price charts.
  - **Market Analysis:** Get insights on market trends, volatility, and whether a card is considered under or overvalued.
  - **Investment Score:** A unique score to quickly gauge a card's investment potential.
- **Responsive Design:** A clean, modern, and responsive UI that works seamlessly on desktop and mobile devices.

## Tech Stack

- **Frontend:**
  - [React](https://reactjs.org/)
  - [Vite](https://vitejs.dev/)
  - [TypeScript](https://www.typescriptlang.org/)
  - [Tailwind CSS](https://tailwindcss.com/)
- **Data:**
  - [PokemonTCG.io API](https://pokemontcg.io/) for card data.
  - Simulated data for PSA populations and investment metrics.
- **Icons:**
  - [Lucide React](https://lucide.dev/)
- **Charts:**
  - [Recharts](https://recharts.org/)

## Getting Started

Follow these instructions to get a local copy of the project up and running.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/)

### Installation

1.  **Clone the repository:**
    ```sh
    git clone <YOUR_REPOSITORY_URL>
    cd TCGTracker
    ```

2.  **Install NPM packages:**
    ```sh
    npm install
    ```

### Running the Application

To start the development server, run:

```sh
npm run dev
```

The application will be available at `http://localhost:5173` (or the next available port).

### Other Scripts

- **Build for production:**
  ```sh
  npm run build
  ```

- **Lint your code:**
  ```sh
  npm run lint
  ```

- **Preview the production build:**
  ```sh
  npm run preview
  ```

## Project Structure

```
TCGTracker/
├── public/
├── src/
│   ├── components/  # Reusable React components
│   ├── hooks/       # Custom React hooks (e.g., for data fetching)
│   ├── services/    # API interaction layer
│   ├── types/       # TypeScript type definitions
│   ├── utils/       # Utility functions (sorting, etc.)
│   ├── App.tsx      # Main application component
│   └── main.tsx     # Application entry point
├── package.json
└── README.md
```
