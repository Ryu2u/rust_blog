export function Temp() {
    const html = `
    <p>[toc]</p>
    <h1>Rust</h1>
    <p><a  href="https://www.rust-lang.org/tools/install">Rust安装程序</a>.</p>
    <p><a href="https://course.rs/about-book.html">Rust语言圣经</a>.</p>
    <p><a href="https://rustwiki.org/zh-CN/std/index.html">Rust API文档</a>.</p>
    <p><a href="https://rust-coding-guidelines.github.io/rust-coding-guidelines-zh/overview.html">Rust编码规范</a>.</p>
    <h2>目录结构</h2>
    <p>Cargo 使用文件放置惯例，以便轻松进入新的 Cargo 项目:</p>
    <pre><code class="language-shell">.
├── Cargo.lock
├── Cargo.toml
├── benches
│   └── large-input.rs
├── examples
│   └── simple.rs
├── src
│   ├── bin
│   │   └── another_executable.rs
│   ├── lib.rs
│   └── main.rs
└── tests
    └── some-integration-tests.rs
</code></pre>
    <ul>
        <li>
            <p><code>Cargo.toml</code>和<code>Cargo.lock</code>存储在项目的根目录中.</p>
        </li>
        <li>
            <p>源代码进入<code>src</code>目录.</p>
        </li>
        <li>
            <p>默认库文件是<code>src/lib.rs</code>.</p>
        </li>
        <li>
            <p>默认的可执行文件是<code>src/main.rs</code>.</p>
        </li>
        <li>
            <p>其他可执行文件，可以放入<code>src/bin/*.rs</code>.</p>
        </li>
        <li>
            <p>集成测试进入<code>tests</code>目录(单元测试进到，正在测试的每个文件中).</p>
        </li>
        <li>
            <p>示例进入<code>examples</code>目录.</p>
        </li>
        <li>
            <p>基准进入<code>benches</code>目录.</p>
        </li>
    </ul>
    <h2>一、Hello World</h2>
    <pre lang="no-highlight"><code class="language-rust">fn main(){
    println!(&quot;Hello World!&quot;);
}
</code></pre>
    <p>程序的第一行定义了一个名为 <code>main</code>的函数，这个 <code>main</code>函数很特别：他总是在每个可执行的Rust程序中运行的第一个代码，他没有参数并且不返回任何内容，如果有参数，他们会放在括号内。</p>
    <p>Rust要求所有函数体都使用 <code>{}</code>大括号括起来。</p>
    <p>第二行 <code>println!(&quot;Hello World!&quot;);</code>，这一行完成了这个小程序的所有工作，它将文本打印到屏幕上。</p>
    <p>其中，<code>println!</code>调用Rust宏，如果同调用了一个函数，他将被输入为 <code>println</code>(不带！)，现在，你只需要知道使用 <code>a!</code>意味着你正在调用宏而不是普通函数，并且宏并不总是遵循与功能。
    </p>
    <h2>二、Cargo</h2>
    <h3>2.1 什么是Cargo</h3>
    <p>Cargo是Rust的构建系统和包管理器，大多数Rustaceans使用这个工具来管理他们的Rust项目，因为Cargo可以做许多事，例如构建你的代码，下载你的代码所需要的依赖库，或者构建这些库。</p>
    <p>最简单的Rust程序，例如我们之前写过的哪样，不需要其他依赖，如果我们使用 <code>Cargo</code>构建了这个 <code>Hello World</code>程序，他只会使用 <code>Cargo</code>中构建代码的部门，但是如果你需要编写更加复杂的程序，你将需要其他依赖库，并且，如果这时你使用
        <code>Cargo</code>启动项目，添加依赖会变得更加简单。</p>
    <h3>2.2 使用Cargo构建项目</h3>
    <p>你可以在任何操作系统上，运行以下命令去构建一个Cargo项目</p>
    <pre><code class="language-bash">cargo new hello_cargo
cd hello_cargo
</code></pre>
    <p>第一个命令会创建一个新的名为 <code>hello_cargo</code>的目录，我们将项目命名为 <code>hello_world</code>并且，cargo在同名目录中创建其文件。</p>
    <p>可以看到，cargo为我们生成了两个文件，<code>Cargo.lock</code> <code>Cargo.toml</code> 和一个src目录</p>
    <p>打开 <code>Cargo.toml</code>你会看到以下内容</p>
    <pre><code class="language-rust">[package]
// 配置的名称
name = &quot;hello_cargo&quot;
// 版本
version = &quot;0.1.0&quot;
// 要使用的Rust版本
edition = &quot;2021&quot;

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[dependencies]
// 后面是你需要在项目中使用的依赖项
</code></pre>
    <p>该文件采用 <code>TOML</code>格式，也就是Cargo的配置格式</p>
    <h3>2.3 使用新的镜像地址</h3>
    <p><strong>在<code>$HOME/.cargo/config.toml</code>下添加</strong></p>
    <pre><code class="language-toml">[source.crates-io]
replace-with = 'ustc'

[source.ustc]
registry = &quot;git://mirrors.ustc.edu.cn/crates.io-index&quot;
</code></pre>
    <p>这是使用新注册服务来替代默认的 <code>crates.io</code>。</p>
    <h3>2.4 切换rustup 工具链</h3>
    <pre><code class="language-shell">$ rustup toolchain list // 用来查看rust工具链列表
\tstable-x86_64-pc-windows-gnu (default)
\tstable-x86_64-pc-windows-msvc
// 如果只有一个，可以执行下面的命令安装另一个工具链
$ rustup toolchain install stable-gnu/stable-msvc
// 切换工具链
$ rustup default stable-gnu/stable-msvc
</code></pre>
    <h2>三、基础语法</h2>
    <h3>3.1 变量和可变性</h3>
    <p>Rust是强类型语言，但具有自动判断变量类型的能力。</p>
    <p>如果需要声明变量，需要使用 <code>let</code>关键字，例如：</p>
    <p><code>let a = 123;</code></p>
    <p>Rust中的变量分为：可变变量和不可变变量。</p>
    <p>如果需要使变量可变，需要添加 <code>mut</code>关键字，例如：</p>
    <p><code>let mut a = 123;</code></p>
    <p>这样，a就可以随改变了。</p>
    <p>当然，不可变变量和常量还是有区别的，不可变变量的值可以 <code>重新绑定</code>，但在重新绑定前不能私自更改，而常量则是一旦定义就不可</p>
    <h4>3.1.2 常量</h4>
    <p>与变量一样，常量是绑定到名称且不允许更改的值，但常量和变量之间存在一些差异。</p>
    <ul>
        <li>不允许将 <code>mut</code>与常量一起使用，常量始终是不可变的。</li>
        <li>使用 <code>const</code>而不是 <code>let</code>进行声明，并且注明值的数据类型</li>
        <li>常量可以在审核范围内声明，包括全局范围。</li>
        <li>常量只能设置为常量表达式，而不是只能在运行时计算的值的结果</li>
    </ul>
    <p>例如：</p>
    <pre><code class="language-rust">const THREE_HOURS_IN_SECONDS: u32 = 60 * 60 * 3
</code></pre>
    <h3>3.2 数据类型</h3>
    <p>Rust中的每个值都是特定的数据类型，他告诉Rust指定了哪种数据，因此他知道如何处理这些数据，我们将研究两种数据类型子集：Scalar(标量)和Compound(复合)</p>
    <h4>3.2.1 Scalar Type 标量类型</h4>
    <p>标量类型表示单个值，Rust有四种主要的标量类型：<code>整数</code>，<code>浮点数</code>，<code>布尔值</code>和 <code>字符</code>。</p>
    <h5>3.2.2 Integer Types 整数类型</h5>
    <p>Rust中整数分为无符号整数和有符号整数，其中又细分了各个整数占用的空间大小，例如：</p>
    <p><img src="https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com//image-20221018150215128.png" alt="image-20221018150215128"/></p>
    <h5>3.2.3 浮点类型</h5>
    <p>Rust也有两种用于浮点数的原始类型，他们是带小数点的数字，Rust的浮点类型是 <code>f32</code>和 <code>f64</code>，他们的大小分别为32位和64位。默认类型是f64，因为在现代CPU上，他的速度与f32大致相同，但精度更高，所有浮点类型都是有符号的。
    </p>
    <h5>3.2.4 布尔类型</h5>
    <p>与大多数其他编程语言一样，Rust中的布尔类型有两种可能的值：true和false。</p>
    <pre><code class="language-rust">fn main(){
    let x = true;
    let f:bool = false;
}
</code></pre>
    <h5>3.2.5 字符类型</h5>
    <p>Rust的char类型是该语言最原始的字母类型。</p>
    <pre><code class="language-rust">fn main(){
    let c = 'z';
    let z:char = 'z';
    let heart_eyed_cat = '😻';
}
</code></pre>
    <p>Rust的char类型大小为4个字节，表示一个Unicode标量值。</p>
    <h5>3.2.6 复合类型</h5>
    <p>Rust的复合类型可以将多个值组合为一种类型，Rust有两种原始的复合类型：元组和数组。</p>
    <p><strong>元组</strong></p>
    <p>元组是将具有多种类型的多个值组合成一个复合类型的一般方法，元组具有固定长度，一旦声明，他们的大小就不能增长或缩小。</p>
    <p>例如：</p>
    <pre><code class="language-rust">fn main(){
    let tup:(i32, f64, u8) = (500, 6.4, 1);
}
</code></pre>
    <p>该变量 <code>tup</code>绑定到整个元组，因为元组被视为单个复合元素，若我们需要从元组中取出单个值，我们可以使用模式匹配来解构元组值，例如：</p>
    <pre><code class="language-rust">fn main(){
    let tup = (500, 6.4, 1);
    let(x,y,z) = tup;
    println!(&quot;the value of y is {y}&quot;);
}
</code></pre>
    <p>或者，你可以使用 <code>.</code>号加你需要访问的值的索引来直接访问元组元素，例如：</p>
    <pre><code class="language-rust">fn main() {
    let x: (i32,f64,u8) = (500,6.4,1);
    let five_hundred = x.0; // 500
    let six_point_four = x.1; // 6.4
    let one = x.2; // 1
}
</code></pre>
    <p>没有任何值的元组有一个特殊的名称 <code>unit</code>，这个值及其对应的类型都被写入 <code>()</code>并表示一个空值或一个空的返回类型，如果表达式不返回任何其他值，则表达式会隐式返回单位值。</p>
    <p><strong>数组类型</strong></p>
    <p>与元组不同，数组的每个元素都必须具有相同的类型，与其他一些语言中的数组不同，Rust中的数组具有固定长度。</p>
    <pre><code class="language-rust">fn main(){
    let a = [1,2,3,4,5];
}
</code></pre>
    <p>另外，你可以通过 <code>:</code>声明数组的类型和长度</p>
    <pre><code class="language-rust">fn main() {
    let a:[i32;5]=[1,2,3,4,5];
}
</code></pre>
    <p>其中 <code>i32</code>为数组中能存放的数据类型，<code>；</code>号为分隔符，分号后面的数字表示这个数组的长度。</p>
    <p>你还可以通过指定初始值，后跟分号和方括号中的数组长度来初始化数组以包含每个元素的相同值。</p>
    <pre><code class="language-rust">let a = [3;5];
</code></pre>
    <p>这表示名为a的数组将包含5个元素，这些元素的初始值都为3，这个写法与 <code>let a = [3.2,3.2,3];</code>相同。</p>
    <p>数组是可以在堆栈上分配的已知固定大小的单个内存块，您可以使用索引访问数组的元素，例如：</p>
    <pre><code class="language-rust">fn main(){
    let a = [1,2,3,4,5];
    let first = a[0];
    let five = a[4];
}
</code></pre>
    <h3>3.3 函数</h3>
    <p>函数的表达式</p>
    <pre><code class="language-rust">fn main(){
    let y = {
        let x = 3;
        x + 1
    };
    println!(&quot;the value of y is {y}&quot;);
    // the value of y is 4
}
</code></pre>
    <p>其中，大括号括起来的是一个块，</p>
    <p><strong>注意：该 <code>x+1</code>行的末尾没有 <code>；</code>号，如果需要将 <code>x+1</code>的计算结果返回，你将不能添加分号，如果添加分号，它将不会返回值。</strong></p>
    <h4>3.3.1返回值</h4>
    <p>函数可以将值返回给调用他们的代码，我们不命名返回值，但我们必须在箭头 <code>-&gt;</code>之后声明他们的类型，在Rust中，函数的返回值与函数体块中的最终表达式的值同义，你可以通过使用 <code>return</code>关键字并指定一个值从函数中提前返回，但大多数函数会隐式返回最后一个表达式。
    </p>
    <pre><code class="language-rust">fn five()-&gt;i32{
    5
}
fn main(){
    let x = five();
   \tprintln!(&quot;the value of x is {x}&quot;);
}
</code></pre>
    <h3>3.4 控制流</h3>
    <h4>3.4.1 if表达式</h4>
    <pre><code class="language-rust">fn main(){
    let number = 3;
    if number &lt; 5{
        ...
    }else{
        ...
    }

}
</code></pre>
    <p>还值得注意的是，因为 <code>if</code>是一个表达式，我们可以在语句的右侧使用 <code>let</code>来讲结果分配给一个变量，例如：</p>
    <pre><code class="language-rust">fn main(){
    let condition = true;
    let number = if condition {5} else {6};

}
</code></pre>
    <p>而当你需要这么做时，你需要将 <code>if</code>表达式块中的每一个返回值都是同一个类型，不然rust编译器将会报错。</p>
    <h4>3.4.2 循环</h4>
    <pre><code class="language-rust">fn main(){
    loop {
        println!(&quot;still loop&quot;);
    }
}
</code></pre>
    <p>同样，循环可以返回你需要的返回值，例如：</p>
    <pre><code class="language-rust">fn main(){
    let mut counter = 0;
    let result = loop {
        counter += 1;
        if counter == 10{
            break counter * 2;
        }
    };
   println!(&quot;the result is {result}&quot;);
}
</code></pre>
    <p><strong>循环标签以消除多个循环之间的歧义</strong></p>
    <p>如果循环中有循环，我们可以在循环上指定标签，并可以在内循环中退出外循环。</p>
    <pre><code class="language-rust">fn loop_label(){
    let mut count = 0;
    'counting_up:loop{
        println!(&quot;count = {count}&quot;);
        let mut remaing = 10;
        loop{
            println!(&quot;remaing is {remaing}&quot;);
            if remaing==9 {
                break;
            }
            if count==2 {
                break 'counting_up;
            }
            remaing -= 1;
        }
        count += 1;
    }
    println!(&quot;end count is {count}&quot;);
}
</code></pre>
`

    return (
        <div className={"markdown-body"} dangerouslySetInnerHTML={{
            __html: html
        }}>
        </div>
    );
}