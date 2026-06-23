import { arbitrum, base, baseSepolia, mainnet, optimism, polygon, sepolia } from 'wagmi/chains';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum, optimism, polygon, baseSepolia, sepolia],
  connectors: [injected()],
  ssr: true,
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
  },
});
