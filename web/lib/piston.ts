/**
 * Code Execution — NexusLearn
 *
 * Python  → Pyodide WASM in a Web Worker (100% local, no server, no Docker)
 * Others  → Wandbox API (free, no key, 12+ languages)
 *
 * The usePyodide() hook manages the Worker lifecycle.
 * CodeStudio imports executePython() for Python runs and executeCode() for all others.
 */

export interface CodeRunResult {
  stdout: string;
  stderr: string;
  compileError: string;
  exitCode: number;
  elapsedMs: number;
}

export interface CodeRunRequest {
  language: string;
  code: string;
  stdin?: string;
}

export const SUPPORTED_LANGUAGES = [
  { id: "python",     label: "Python",     compiler: "cpython-head",      ext: "py",   icon: "🐍" },
  { id: "javascript", label: "JavaScript", compiler: "nodejs-20.17.0",    ext: "js",   icon: "🟨" },
  { id: "cpp",        label: "C++",        compiler: "gcc-head",          ext: "cpp",  icon: "⚙️" },
  { id: "c",          label: "C",          compiler: "gcc-head-c",        ext: "c",    icon: "🔧" },
  { id: "rust",       label: "Rust",       compiler: "rust-1.82.0",       ext: "rs",   icon: "🦀" },
  { id: "go",         label: "Go",         compiler: "go-1.23.2",         ext: "go",   icon: "🐹" },
  { id: "java",       label: "Java",       compiler: "openjdk-jdk-22+36", ext: "java", icon: "☕" },
  { id: "ruby",       label: "Ruby",       compiler: "ruby-3.4.1",        ext: "rb",   icon: "💎" },
  { id: "bash",       label: "Bash",       compiler: "bash",              ext: "sh",   icon: "📜" },
];

export const DEFAULT_CODE: Record<string, string> = {
  python: `# Python — NexusLearn
def fibonacci(n):
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

print("Fibonacci(10):", fibonacci(10))
print("Sum:", sum(fibonacci(10)))`,

  javascript: `// JavaScript — NexusLearn
function fibonacci(n) {
  let [a, b] = [0, 1];
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(a);
    [a, b] = [b, a + b];
  }
  return result;
}

console.log("Fibonacci(10):", fibonacci(10));
console.log("Sum:", fibonacci(10).reduce((a, b) => a + b, 0));`,

  cpp: `// C++ — NexusLearn
#include <iostream>
#include <vector>
#include <numeric>

std::vector<int> fibonacci(int n) {
    std::vector<int> result;
    int a = 0, b = 1;
    for (int i = 0; i < n; i++) {
        result.push_back(a);
        int c = a + b; a = b; b = c;
    }
    return result;
}

int main() {
    auto fib = fibonacci(10);
    std::cout << "Fibonacci(10): ";
    for (int x : fib) std::cout << x << " ";
    std::cout << std::endl;
    std::cout << "Sum: " << std::accumulate(fib.begin(), fib.end(), 0) << std::endl;
    return 0;
}`,

  c: `// C — NexusLearn
#include <stdio.h>

void fibonacci(int n) {
    int a = 0, b = 1;
    printf("Fibonacci(%d): ", n);
    for (int i = 0; i < n; i++) {
        printf("%d ", a);
        int c = a + b; a = b; b = c;
    }
    printf("\\n");
}

int main() {
    fibonacci(10);
    return 0;
}`,

  rust: `// Rust — NexusLearn
fn fibonacci(n: u64) -> Vec<u64> {
    let mut result = Vec::new();
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 0..n {
        result.push(a);
        let c = a + b; a = b; b = c;
    }
    result
}

fn main() {
    let fib = fibonacci(10);
    println!("Fibonacci(10): {:?}", fib);
    println!("Sum: {}", fib.iter().sum::<u64>());
}`,

  go: `// Go — NexusLearn
package main

import "fmt"

func fibonacci(n int) []int {
	result := make([]int, n)
	a, b := 0, 1
	for i := 0; i < n; i++ {
		result[i] = a
		a, b = b, a+b
	}
	return result
}

func main() {
	fib := fibonacci(10)
	fmt.Println("Fibonacci(10):", fib)
	sum := 0
	for _, v := range fib { sum += v }
	fmt.Println("Sum:", sum)
}`,

  java: `// Java — NexusLearn
import java.util.Arrays;

public class Main {
    static int[] fibonacci(int n) {
        int[] result = new int[n];
        int a = 0, b = 1;
        for (int i = 0; i < n; i++) {
            result[i] = a;
            int c = a + b; a = b; b = c;
        }
        return result;
    }
    
    public static void main(String[] args) {
        int[] fib = fibonacci(10);
        System.out.println("Fibonacci(10): " + Arrays.toString(fib));
        System.out.println("Sum: " + Arrays.stream(fib).sum());
    }
}`,

  ruby: `# Ruby — NexusLearn
def fibonacci(n)
  result = []
  a, b = 0, 1
  n.times { result << a; a, b = b, a + b }
  result
end

fib = fibonacci(10)
puts "Fibonacci(10): #{fib.inspect}"
puts "Sum: #{fib.sum}"`,

  bash: `#!/bin/bash
# Bash — NexusLearn
fibonacci() {
  local n=\$1 a=0 b=1
  local result=()
  for ((i=0; i<n; i++)); do
    result+=(\$a)
    local c=\$((a+b)); a=\$b; b=\$c
  done
  echo "\${result[@]}"
}

fib=(\$(fibonacci 10))
echo "Fibonacci(10): \${fib[@]}"
sum=0
for x in "\${fib[@]}"; do ((sum+=x)); done
echo "Sum: \$sum"`,
};

/**
 * Execute Python code via Pyodide WASM (browser-local, no server needed).
 * This is a thin wrapper — the actual work happens in usePyodide.runPython().
 * CodeStudio calls this via the hook; this export is for non-hook contexts.
 * Falls back to Wandbox if called server-side.
 */
export async function executePython(
  code: string,
  stdin?: string
): Promise<CodeRunResult> {
  // This path is only hit if called outside of usePyodide hook context.
  // Normally CodeStudio uses usePyodide() directly.
  // Fallback: route through Wandbox cpython compiler.
  return executeCode({ language: "python", code, stdin });
}

export async function executeCode(req: CodeRunRequest): Promise<CodeRunResult> {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.id === req.language);
  if (!lang) throw new Error(`Unsupported language: ${req.language}`);

  const startMs = performance.now();

  const body: Record<string, any> = {
    compiler: lang.compiler,
    code: req.code,
  };
  if (req.stdin) {
    body.stdin = req.stdin;
  }

  const response = await fetch("https://wandbox.org/api/compile.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Wandbox API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const elapsedMs = performance.now() - startMs;

  // Wandbox status: "0" = success
  const exitCode = data.status === "0" ? 0 : 1;

  return {
    stdout: data.program_output || "",
    stderr: data.program_error || "",
    compileError: data.compiler_error || "",
    exitCode,
    elapsedMs,
  };
}
