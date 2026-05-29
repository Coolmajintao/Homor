// 编译时常量声明
// ts-node 开发时：__DEV__ 未定义，__DEV__ !== false → true → 走开发分支
// esbuild 生产构建时：--define:__DEV__=false → false !== false → false → 日志代码被 DCE 移除
declare const __DEV__: boolean;
