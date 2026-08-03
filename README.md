# OVS MCP

Serveur [Model Context Protocol](https://modelcontextprotocol.io/) non officiel pour [Official Vegan Shop](https://www.officialveganshop.com/). Ajoutez ce dépôt à Codex, Claude Code ou tout client MCP compatible, connectez votre compte OVS, puis recherchez des produits et préparez votre panier en langage naturel.

Projet indépendant, sans affiliation avec Official Vegan Shop.

## Installation dans un client MCP

Prérequis : Node.js 22.12 ou plus récent.

Utilisez directement le dépôt GitHub, sans clone local :

```json
{
  "mcpServers": {
    "ovs": {
      "command": "npx",
      "args": [
        "-y",
        "--package=github:ncleton-petitmaker/ovs-mcp",
        "ovs-mcp"
      ]
    }
  }
}
```

Cette configuration utilise le transport MCP `stdio`, commun aux clients de bureau. Redémarrez le client après l’ajout.

## Connexion

Demandez simplement :

> Connecte mon compte Official Vegan Shop.

Le client appelle `connect_ovs` et affiche un lien de connexion local sécurisé. Saisissez vos identifiants sur cette page, puis revenez dans le client.

- Le mot de passe ne passe jamais dans la conversation ni dans le protocole MCP.
- Le mot de passe n’est jamais enregistré.
- Seuls les cookies nécessaires à la session sont conservés localement dans un fichier privé (`0600`).
- Les outils ne renvoient ni profil client, ni email, ni adresse.

Exemples de demandes :

> Cherche du seitan disponible et montre-moi les cinq meilleurs résultats.

> Ajoute deux unités du premier produit au panier.

> Montre-moi le panier OVS.

Toute modification du panier est prévisualisée et exige une confirmation liée à l’état exact du panier.

## Outils MCP

| Outil | Fonction |
|---|---|
| `connect_ovs` | Vérifie la connexion ou fournit le lien de connexion sécurisé |
| `search_products` | Recherche le catalogue OVS en direct |
| `get_cart` | Lit le panier sans exposer les données du compte |
| `add_to_cart` | Prévisualise, confirme et ajoute un produit |
| `remove_from_cart` | Prévisualise, confirme et retire un produit |

## CLI

```bash
npx -y --package=github:ncleton-petitmaker/ovs-mcp ovs connect
npx -y --package=github:ncleton-petitmaker/ovs-mcp ovs search "seitan"
npx -y --package=github:ncleton-petitmaker/ovs-mcp ovs cart
```

## Développement

```bash
npm ci
npm run verify
```

Le serveur HTTP optionnel n’écoute que sur la boucle locale :

```bash
npm run compile
node dist/index.js --transport http
```

## Sécurité et confidentialité

Le dépôt ne contient aucun compte, identifiant, cookie, panier ou fixture personnelle. Le contrôle de confidentialité analyse aussi le paquet distribuable avant publication. Consultez [SECURITY.md](SECURITY.md) pour signaler un problème sans publier de secret.

Licence MIT.
