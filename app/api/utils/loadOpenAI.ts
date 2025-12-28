export const loadOpenAI = async (): Promise<any> => {
  const module = await import(/* @vite-ignore */ "openai");
  return module.default ?? module;
};
