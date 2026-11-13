// Configuração dinâmica: tudo vem do app.json; só a versão web pode morar numa pasta
// (ex.: www.cedcci.com.br/kioskpay). Os apps nativos não usam o baseUrl.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
