declare module 'inspirational-quotes' {
  export const getRandomQuote: () => string
  export const getQuote: () => {
    text: string
    author: string
  }
}
