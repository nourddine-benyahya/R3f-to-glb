import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import babel from "@rollup/plugin-babel";
import pkg from "./package.json" assert { type: "json" };

const extensions = [".js", ".jsx", ".ts", ".tsx"];

export default {
  input: "src/index.ts",

  plugins: [
    resolve({ extensions }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
    }),
    babel({
      babelHelpers: "bundled",
      exclude: "node_modules/**",
      extensions,
    }),
  ],

  external: [
    /^react(\/.*)?$/,
    /^react-dom(\/.*)?$/,
    /^@react-three\/fiber(\/.*)?$/,
    "three",
  ],

  output: [
    {
      file: pkg.main,
      format: "cjs",
      sourcemap: true,
    },
    {
      file: pkg.module,
      format: "esm",
      sourcemap: true,
    },
  ],
};
