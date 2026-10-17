/** esbuild dataurl loader 内联资产的类型声明（client bundle 单文件协议）。 */
declare module '*.png' {
  const src: string;
  export default src;
}
