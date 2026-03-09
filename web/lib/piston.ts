/**
 * Piston Code Execution API
 * Free public API: emkc.org/api/v2/piston
 * No API key needed. Supports 80+ languages.
 */

export interface PistonRunResult {
  language: string;
  version: string;
  run: {
    stdout: string;
    stderr: string;
    code: number;
    signal: string | null;
    output: string;
  };
  compile?: {
    stdout: string;
    stderr: string;
    code: number;
    signal: string | null;
    output: string;
  };
}

export interface CodeRunRequest {
  language: string;
  version: string;
  code: string;
  stdin?: string;
  args?: string[];
}

export const SUPPORTED_LANGUAGES = [
  { id: "python",     label: "Python",      version: "3.10.0",  ext: "py",   icon: "🐍" },
  { id: "javascript", label: "JavaScript",  version: "18.15.0", ext: "js",   icon: "🟨" },
  { id: "typescript", label: "TypeScript",  version: "5.0.3",   ext: "ts",   icon: "🔷" },
  { id: "cpp",        label: "C++",         version: "10.2.0",  ext: "cpp",  icon: "⚙️" },
  { id: "c",          label: "C",           version: "10.2.0",  ext: "c",    icon: "🔧" },
  { id: "rust",       label: "Rust",        version: "1.68.2",  ext: "rs",   icon: "🦀" },
  { id: "go",         label: "Go",          version: "1.20.3",  ext: "go",   icon: "🐹" },
  { id: "java",       label: "Java",        version: "15.0.2",  ext: "java", icon: "☕" },
  { id: "kotlin",     label: "Kotlin",      version: "1.8.20",  ext: "kt",   icon: "🎯" },
  { id: "swift",      label: "Swift",       version: "5.3.3",   ext: "swift",icon: "🍎" },
  { id: "bash",       label: "Bash",        version: "5.2.0",   ext: "sh",   icon: "📜" },
  { id: "ruby",       label: "Ruby",        version: "3.0.1",   ext: "rb",   icon: "💎" },
];

export const DEFAULT_CODE: Record<string, string> = {
  python: `# Python - NexusLearn Code Runner
def greet(name):
    return f"Hello, {name}! Welcome to NexusLearn."

result = greet("Student")
print(result)

# Try some math
import math
print(f"π = {math.pi:.4f}")
print(f"√2 = {math.sqrt(2):.4f}")`,

  javascript: `// JavaScript - NexusLearn Code Runner
function greet(name) {
  return \`Hello, \${name}! Welcome to NexusLearn.\`;
}

console.log(greet("Student"));

// Array operations
const nums = [1, 2, 3, 4, 5];
const sum = nums.reduce((a, b) => a + b, 0);
console.log(\`Sum of [1..5] = \${sum}\`);`,

  cpp: `// C++ - NexusLearn Code Runner
#include <iostream>
#include <vector>
#include <numeric>

int main() {
    std::cout << "Hello from C++! Welcome to NexusLearn." << std::endl;
    
    std::vector<int> nums = {1, 2, 3, 4, 5};
    int sum = std::accumulate(nums.begin(), nums.end(), 0);
    std::cout << "Sum of [1..5] = " << sum << std::endl;
    
    return 0;
}`,

  rust: `// Rust - NexusLearn Code Runner
fn main() {
    println!("Hello from Rust! Welcome to NexusLearn.");
    
    let nums: Vec<i32> = (1..=5).collect();
    let sum: i32 = nums.iter().sum();
    println!("Sum of [1..5] = {}", sum);
    
    // Fibonacci
    let fib = |n: u64| -> u64 {
        let (mut a, mut b) = (0u64, 1u64);
        for _ in 0..n { let c = a + b; a = b; b = c; }
        a
    };
    println!("Fibonacci(10) = {}", fib(10));
}`,

  go: `// Go - NexusLearn Code Runner
package main

import "fmt"

func main() {
    fmt.Println("Hello from Go! Welcome to NexusLearn.")
    
    sum := 0
    for i := 1; i <= 5; i++ {
        sum += i
    }
    fmt.Printf("Sum of [1..5] = %d\\n", sum)
}`,

  java: `// Java - NexusLearn Code Runner
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java! Welcome to NexusLearn.");
        
        int sum = 0;
        for (int i = 1; i <= 5; i++) sum += i;
        System.out.printf("Sum of [1..5] = %d%n", sum);
    }
}`,
  
  typescript: `// TypeScript - NexusLearn Code Runner
function greet(name: string): string {
  return \`Hello, \${name}! Welcome to NexusLearn.\`;
}

console.log(greet("Student"));

const nums: number[] = [1, 2, 3, 4, 5];
const sum: number = nums.reduce((a, b) => a + b, 0);
console.log(\`Sum of [1..5] = \${sum}\`);`,

  bash: `#!/bin/bash
# Bash - NexusLearn Code Runner
echo "Hello from Bash! Welcome to NexusLearn."

# Loop example
sum=0
for i in 1 2 3 4 5; do
    sum=$((sum + i))
done
echo "Sum of [1..5] = $sum"`,

  ruby: `# Ruby - NexusLearn Code Runner
def greet(name)
  "Hello, #{name}! Welcome to NexusLearn."
end

puts greet("Student")
sum = (1..5).sum
puts "Sum of [1..5] = #{sum}"`,
};

export async function executeCode(req: CodeRunRequest): Promise<PistonRunResult> {
  const response = await fetch("https://emkc.org/api/v2/piston/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: req.language,
      version: req.version,
      files: [{ content: req.code }],
      stdin: req.stdin || "",
      args: req.args || [],
      run_timeout: 10000,
      compile_timeout: 10000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Piston API error: ${response.status}`);
  }

  return response.json();
}
