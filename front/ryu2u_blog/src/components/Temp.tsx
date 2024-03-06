export function Temp() {
    const html = `<article class="markdown-body">
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
    <p><strong>for循环</strong></p>
    <pre><code class="language-rust">fn main(){
    let arr = [1,2,3,4,5];
    for item in arr {
        println!(&quot;the value is {item}&quot;);
    }
}
</code></pre>
    <p>另一个运行一定次数的情况下，可以使用这样的for循环，他按照顺序生成所有数字，从一个数字开始，在另一个数字之前结束</p>
    <pre><code class="language-rust">fn main(){
    for number in (1..4).rev(){
        println!(&quot;{number}&quot;);
    }
    println!(&quot;LIFTOFF!!!&quot;);
}
</code></pre>
    <p>上面的代码会依次输出3,2,1</p>
    <h3>四、Ownership 所有权</h3>
    <p>所有权是控制rust程序如何管理内存的一组规则，所有程序都必须管理运行时使用计算机内存的方式，一些语言有垃圾收集，在程序运行时定期查找不在使用的内存。在其他语言中，程序员必须明确地分配和释放内存。</p>
    <p>Rust使用了第三种方法：内存通过一个所有权系统进行管理，该系统具有编译器检查的一组规则，如果违反了规则，程序将无法编译，所有权的所有特性都不会在程序运行时减慢程序的速度。</p>
    <h4>4.1 所有权的规则</h4>
    <p>所有权有三个规则:</p>
    <ul>
        <li>Rust中的每一个值都有一个所有者</li>
        <li>一次只能有一个所有值</li>
        <li>当所有者找出范围时，该值将被删除</li>
    </ul>
    <h5>4.1.1 mut在:左边和右边时的区别</h5>
    <pre><code class="language-rust">fn do1(c:String){}: 表示实参会将所有权传递给c
fn do2(c:&amp;String){}: 表示实参的不可变引用传递给c，实参需要带&amp;声明
fn do3(c:&amp;mut String){}: 表示实参可变引用传递给c，实参需要带let mut声明，且传入时需带&amp;mut
fn do4(mut c: Stirng){}: 表示实现会将所有权传递给c，且在函数体内c是可读可写的，实参无需mut声明
fn do5(mut c:&amp;mut String){}: 表示实参可变引用指向的值传递给c且c在函数体内部是可读可写的，实参需要let mut 声明，且传入需带&amp;mut
</code></pre>
    <blockquote>
        <p>总结: 在函数参数中，冒号左边的部分，如:<code>mut c</code>这个<code>mut</code>是对<code>函数体内部有效</code>，冒号右边的部分，如:<code>&amp;mut
            String</code>，这个<code>&amp;mut</code>是针对<code>外部实参传入时的形式说明</code>。</p>
    </blockquote>
    <h4>4.2 可变范围</h4>
    <p>范围是程序中项目的有效范围，例如以下的例子，说明了一个字符串s的范围:</p>
    <pre><code class="language-rust">fn main(){
    \t\t\t     // s在这里无效，他还未声明
    let s = &quot;hello&quot;; // s从现在起有效
    // 使用s做某些事
    \t\t\t\t // 此作用域现已结束，s不在有效
}
</code></pre>
    <p>这里包含了两个重要的时间点:</p>
    <ul>
        <li>当s进入范围时，它是有效的</li>
        <li>它在超出范围之前一直有效</li>
    </ul>
    <p>Rust采用不同的路径:一旦拥有内存的变量超出范围，内存将自动返回，例如下面的String字符串</p>
    <pre><code class="language-rust">fn main(){
    let s = String::from(&quot;hello&quot;); // s从现在起有效
    // 使用s做某些事
    \t\t\t\t\t// 此作用域结束，但s没有结束
    \t\t\t\t\t// 更长的有效期
}
</code></pre>
    <p>看看下面的例子:</p>
    <pre><code class="language-rust">fn main(){
    let x = 5;
    let y = x;
   // 这里是将值绑定要x，然后赋值x中的值并将其绑定到y
}
</code></pre>
    <pre><code class="language-rust">fn main(){
    let s1 = String::from(&quot;hello&quot;);
    let s2 = s1;
}
</code></pre>
    <p>这里看起来和上面的代码一样，但并不完全是这样，这里的s1相当于一个堆中 <code>hello</code>对象的引用，其中存放了对象的指针、长度和容量</p>
    <p><img src="https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com//image-20221024164656397.png" alt="image-20221024164656397"/></p>
    <p>所以当你将s2和s1绑定时，其实只是将s1的指针、长度和容量复制到了s2中</p>
    <p><img src="https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com//image-20221024170243384.png" alt="image-20221024170243384"/></p>
    <p>当变量超出范围时，Rust会自动调用drop函数并清理该变量的堆内存，但是，这里存在一个问题:当s2和s1超出范围时，他们都会尝试释放相同的内存，这被称为重复释放错误，是内存安全漏洞之一。</p>
    <p>为了确保内存安全，在 <code>let s2 = s1</code>后，Rust认为s1不在有效，因此，当s1超出范围时，Rust不需要释放任何内容。</p>
    <p>例如:</p>
    <pre><code class="language-rust">fn main(){
    let s1 = String::from(&quot;hello&quot;);
    let s2 = s1;
    println!(&quot;{},world!&quot;,s1); // error
}
</code></pre>
    <p>上面这段代码将<strong>不会通过编译</strong>，他会提示你引用了无效的引用。</p>
    <p>此外，Rust还有一个隐含的设计:<strong>Rust永远不会自动创建数据的 <code>深度</code>副本。</strong></p>
    <p>所以当你确实需要深入复制String的堆数据，而不仅仅是堆栈数据时，你可以使用 <code>clone</code>方法，例如:</p>
    <pre><code class="language-rust">fn main(){
    let s1 = String::from(&quot;hello&quot;);
    let s2 = s1.clone();
    println!(&quot;s1 = {},s2 = {}&quot;,s1,s2);
}
</code></pre>
    <p>这段代码将会<strong>正常工作</strong>，并且输出s1 和 s2 的值</p>
    <pre><code class="language-rust">fn main() {
    let x = 5;
    let y = x;

    println!(&quot;x = {}, y = {}&quot;, x, y);
}

</code></pre>
    <p>但是这里，我们没有克隆的调用，x，y仍然可以正常调用，这是由于:<strong>编译时具有已知大小的类型(如整数)完全存储在堆栈中，因此可以快速创建实际值的副本。这意味着我们没有必要阻止x的有效</strong></p>
    <p>在看看下面这段代码</p>
    <pre><code class="language-rust">fn main() {
    let s = String::from(&quot;hello&quot;);  // s 开始定义范围
    takes_ownership(s);             // 将s带入到函数中
    // ... 从这开始，s已经drop了，所以他的所有权将不存在
    let x = 5;                      // x 进入范围
    makes_copy(x);                  // 将x带入函数
    // 由于i32是堆栈中的复制，所以他仍然有效
    // 继续使用x
    println!(&quot;{}&quot;,x);


} // 这里，x开始超出范围，但是s的值已经移除了
// special happens.

fn takes_ownership(some_string: String) { // 一些字符串进入了范围
    println!(&quot;{}&quot;, some_string);
} // 这里，一些字符串开始超出范围，并且编译器会调用drop释放它的内存


fn makes_copy(some_integer: i32) { // 一些整数进入了范围
    println!(&quot;{}&quot;, some_integer);
} // 这里一些整数开始超出范围，
</code></pre>
    <h4>4.3 返回值和范围</h4>
    <p>返回值也可以转移所有权</p>
    <pre><code class="language-rust">fn main() {
    let s1 = gives_ownership();         // gives_ownership函数返回了他的值并且值赋值到了s1

    let s2 = String::from(&quot;hello&quot;);     // s2开始进入范围

    let s3 = takes_and_gives_back(s2);  // s2将进入函数并且这个函数会将它的返回值赋值到s3

} // 这里s3将超出范围并且释放内存，s2已被移除，所以什么都没发生
  // s1超出范围并已被移除

fn gives_ownership() -&gt; String {             // gives_ownership will move its
                                             // return value into the function
                                             // that calls it

    let some_string = String::from(&quot;yours&quot;); // some_string comes into scope

    some_string                              // some_string is returned and
                                             // moves out to the calling
                                             // function
}

// This function takes a String and returns one
fn takes_and_gives_back(a_string: String) -&gt; String { // a_string comes into
                                                      // scope

    a_string  // a_string is returned and moves out to the calling function
}

</code></pre>
    <p>变量的所有权每次都遵循相同的模式:将一个值分配给另一个变量会移动它，当堆中包含数据的变量超出范围时，除非数据的所有权已转移到另一个变量，否则该值将被删除。</p>
    <p>这将导致一个问题:如果我们想让一个函数使用一个值而不是所有权，如果我们想再次使用它，我们传入的任何数据都需要被传入，除了我们可能想要返回的函数体中的任何数据之外。</p>
    <h4>4.4 引用和借用</h4>
    <p>看看下面一段代码</p>
    <pre><code class="language-rust">fn main(){
    let s1 = String::from(&quot;Hello World&quot;);
    let len = calcluate_len(&amp;s1);
    println!(&quot;the length of [{}] is {}&quot;,s1,len);

}

fn calcluate_len(s:&amp;String) -&gt; usize{
        s.len()
}
</code></pre>
    <p>上面的代码将正常运行，即使你在调用完了函数后使用了s1对象，你仍然可以使用它</p>
    <p>它带入参数是使用了 <code>&amp;</code>号，这表示引用，它允许你引用某些值，而无需拥有对他的所有权。</p>
    <p><code>&amp;s1</code>语法运行我们创建引用s1的值但不拥有它的引用，因为不拥有它，所以当引用停止时，它所指向的值不会被删除。</p>
    <p><strong>注意:正如同变量在默认情况下是不可变的一样，引用也是不可变的，我们不允许修改引用的内容。</strong></p>
    <p><strong>可变引用</strong></p>
    <p>我们可以通过一些调整，让程序允许我们修改借用的值</p>
    <pre><code class="language-rust">fn main(){
    let mut s = String::from(&quot;hello&quot;);
    change(&amp;mut s);
}
fn change(str:&amp;mut String){
    str.push_str(&quot;,world&quot;);
}
</code></pre>
    <p>上面的程序将会正常编译并运行。</p>
    <p>这是由于我们使用了 <code>mut</code>关键字将创建的 <code>不可变变量</code>变为了 <code>可变变量</code>，并将可变变量的引用传入函数中，这种引用称为 <code>可变引用</code>。</p>
    <p>但是，可变引用有一个很大的限制:**如果某个值有一个可变引用，则不能有其他对该值的引用。**例如尝试创建两个对s的可变引用的代码将失败。</p>
    <pre><code class="language-rust">let mut s = String::from(&quot;hello&quot;);
let r1 = &amp;mut s;
let r2 = &amp;mut s;
println!(&quot;{},{}&quot;,r1,r2);
</code></pre>
    <p>上面的代码将不能通过编译。</p>
    <p>是由于同一时间只能有一个对于可变引用的访问，再将s赋值给r2时，r1就不能在访问了。</p>
    <p>我们可以使用大括号来创建一个新的范围，允许多个可变引用，而不是同时引用:</p>
    <pre><code class="language-rust"> let mut s = String::from(&quot;hello&quot;);
    {
        let r1 = &amp;mut s;
    }   // 这时r1超出他的生命周期，内存释放
    let r2 = &amp;mut s;
</code></pre>
    <p>但是对于Rust来说，它又允许你同时拥有多个不可变引用的访问</p>
    <p>例如:</p>
    <pre><code class="language-rust">let mut s = String::from(&quot;hello&quot;);

    let r1 = &amp;s;
    let r2 = &amp;s;
    println!(&quot;{r1},{r2}&quot;);
</code></pre>
    <p>上面这段代码是可行的。</p>
    <p>但是注意，可变引用和不可变引用也是不可以混起来使用的。</p>
    <p>如果其中突然插入了一个可变引用，那么还是无法通过编译</p>
    <pre><code class="language-rust">let mut s = String::from(&quot;hello&quot;);

let r1 = &amp;s;
let r2 = &amp;s;
let r3 = &amp;mut s;
println!(&quot;{r1},{r2}&quot;);
</code></pre>
    <p>上面这段代码无法通过编译，即使你没有使用r3变量。</p>
    <p>这是由于不可变引用的用户不会期望值从下面突然改变。所以，允许使用多个不可变的引用，因为仅仅读取数据的人没有能力影响其他人对数据的读取。</p>
    <p>当然，你可以在不可变引用的作用域结束后再引入可变引用，这样是可以的，例如:</p>
    <pre><code class="language-rust">let mut s = String::from(&quot;hello&quot;);

    let r1 = &amp;s;
    let r2 = &amp;s;
    println!(&quot;{r1},{r2}&quot;);

    let r3 = &amp;mut s;
    println!(&quot;{}&quot;, r3);
</code></pre>
    <p>这是可以被接收的，这是由于不可变引用r1和r2的范围在println!之后结束了，他们最后使用的位置是在可变引用r3被创建之前，这些作用域不重叠，因此允许使用此代码。</p>
    <p><strong>引用的参考规则</strong></p>
    <ul>
        <li>在任何给定时间，您可以有一个可变引用或任意数量的不可变引用</li>
        <li>引用必须始终有效</li>
    </ul>
    <h4>4.5 切片类型(The Slic Type)</h4>
    <p>切片允许你引用集合中的连续元素序列，而不是整个集合，切片是一种引用，因此他没有所有权。</p>
    <p>下面是一个切片引用的例子</p>
    <pre><code class="language-rust">fn main() {
    let mut str = String::from(&quot; he hll&quot;);
    let res = first_word(&amp;str);
    //str.clear();
    println!(&quot;{}&quot;, res);

}
fn first_word(str: &amp;String) -&gt; &amp;str {
    let bytes = str.as_bytes();
    for (i, &amp;item) in bytes.iter().enumerate() {
        if item == b' ' {
            if i == 0 {
                continue;
            } else {
                return &amp;str[0..i];
            }
        }
    }
    &amp;str[..]
}
</code></pre>
    <p>first_word返回了一个切片引用，它是字符串str 的一部分或是全部内容，这时当我们再次去clear释放str的内存时，rust编译器将会告诉我们不能这样做。</p>
    <p><strong>字符串文字是切片</strong></p>
    <p>我们看看下这段代码</p>
    <pre><code class="language-rust">let s = &quot;Hello,World&quot;;
</code></pre>
    <p>这里的s类型是 <code>&amp;str</code>，它是一个指向二进制文件的特定点的切片，这也是为什么字符串文字是不可变的，<code>&amp;str</code>是一个不可变的引用。</p>
    <p>所以当我们使用字符串进行传参时，使用 <code>&amp;str</code>更加灵活。</p>
    <p>如果我们有一个字符串切片，我们可以直接传递他，如果我们有一个String，我们可以传递String的一个片段或者对String的引用，这种灵活性利用了 <code>deref coercions</code>。</p>
    <blockquote>
        <p>另外:你还可以像引用字符串切片那样使用其他类型的切片，例如数组</p>
    </blockquote>
    <h3>五、结构体</h3>
    <h4>5.1 定义和实例化结构体</h4>
    <pre><code class="language-rust">struct User{
    active: bool,
    username: String,
    email: String,
    sign_in_count: u64,
}
</code></pre>
    <p>要在定义后使用它，我们需要通过为每个字段指定具体值来创建该结构的实例</p>
    <pre><code class="language-rust">fn main() {
    let user1 = User{
        active: true,
        username: String::from(&quot;admin&quot;),
        email: String::from(&quot;admin@gmail.com&quot;),
        sign_in_count: 1,
    }
}
</code></pre>
    <p>同样，结构体也可以作为函数的返回值</p>
    <pre><code class="language-rust">fn build_user(email:String,username:String)-&gt;User{
    User{
        active: true,
        username: username,
        email: email,
        sign_in_count: 1,
    }
}
</code></pre>
    <p>如果你的参数名和结构体的字段相同的话，可以简化他的生成</p>
    <pre><code class="language-rust">fn build_user(email:String,username:String)-&gt;User{
    User{
        active: true,
        username,
        email,
        sign_in_count: 1,
    }
}
</code></pre>
    <p><strong>使用结构更新语法从其他实例创建实例</strong></p>
    <p>不使用更新语法</p>
    <pre><code class="language-rust">struct User{
    active: bool,
    username: String,
    email: String,
    sign_in_count: u64,
}
fn main(){
    let user1 = User{
        active: true,
        username: String::from(&quot;admin&quot;),
        email: String::from(&quot;admin@gmail.com&quot;),
        sign_in_count: 1,
    }
    let user2 = User{
        active: true,
        username: user1.username,
        email: user1.email,
        sign_in_count: 1,
    }
}
</code></pre>
    <p>使用更新语法</p>
    <pre><code class="language-rust">struct User{
    active: bool,
    username: String,
    email: String,
    sign_in_count: u64,
}
fn main(){
    let user1 = User{
        active: true,
        username: String::from(&quot;admin&quot;),
        email: String::from(&quot;admin@gmail.com&quot;),
        sign_in_count: 1,
    }
    let user2 = User{
        email: String::from(&quot;root&quot;),
        ..user1
    }
}
</code></pre>
    <blockquote>
        <p>注意: ...user1必须排在最后，以指定任何剩余字段都应该从user1中的响应的字段获取值</p>
    </blockquote>
    <p>在上面的例子中，在使用user1给user2赋值后，user1就无法继续使用了，除非你只使用到了user1中的 <code>avtive</code>和 <code>sign_in_count</code>,因为bool和u64类型是实现Copy特性的类型，它是实现的复制而不是引用。
    </p>
    <p>另外，你还可以定义没有任何字段的类单元结构</p>
    <pre><code class="language-rust">struct AlwaysEqual;
fn main(){
    let subject = AlwaysEqual;
}
</code></pre>
    <p>通过使用派生特征可以实现类似java的toString方法一样的控制台打印</p>
    <pre><code class="language-rust">#[derive(Debug)]
struct Rectangle{
    width: u32,
    height: u32,
}

fn main() {
    let scale = 2;
    let rect = Rectangle {
        width: dbg!(30 * scale),
        height: 15,
    };
    println!(&quot;the rect is {:#?}&quot;, rect);
}
</code></pre>
    <p>控制台将会输出</p>
    <pre><code class="language-rust">[src\\main.rs:10] 30 * scale = 60
the rect is Rectangle {
    width: 60,
    height: 15,
}
</code></pre>
    <h4>5.2 结构体中的方法</h4>
    <p>方法类似于函数，但是与函数不同的是，<strong>方法是在结构的上下文中定义的，他们的第一个参数始终是self，他表示调用方法的结构体实例</strong></p>
    <p>我们可以通过定义结构体的方法来使使用结构体实例来调用</p>
    <pre><code class="language-rust">#[derive(Debug)]
struct Rectangle{
    width: u32,
    height: u32,
}

impl Rectangle {
    fn area(&amp;self)-&gt;u32 {
        self.width * self.height
    }
}

fn main() {
    let scale = 2;
    let rect = Rectangle {
        width: dbg!(30 * scale),
        height: 15,
    };
    println!(&quot;the rect is {:#?}&quot;, rect);
    println!(&quot;the area of the rect is {}&quot;, rect.area());
}
</code></pre>
    <p>为了在Rectangle上下文中定义函数，我们为Rectangle启动一个impl块，这个impl块中所有内容都与Rectangle类型相关联。</p>
    <p>在area函数中，<code>&amp;self</code>实际上是 <code>self:&amp;self</code>的缩写。</p>
    <p><strong>构造函数</strong></p>
    <p>在impl块中定义的所有函数都被称为关联函数，因为他们以impl命名的类型相关联。</p>
    <p>我们可以定义一个没有self作为第一个参数的关联函数(因此不是方法)，因为他们不需要使用类型的实例，这种方法通常被称为 <code>非方法的关联函数</code>，通常用于将返回结构的新实例的构造函数。</p>
    <p>非方法的关联函数的调用不需要类型的实例就可以直接调用</p>
    <pre><code class="language-rust">impl Rectangle {
    fn square(size:u32)-&gt;Self{
        Self{
            width: size,
            height: size,
        }
    }
    fn test()-&gt;u32{
        5
    }
}
fn main(){
    let obj = Object::square(2);
    let num = Object::test();
}
</code></pre>
    <p><strong>多个impl块</strong></p>
    <p>每个结构允许有多个impl块，例如</p>
    <pre><code class="language-rust">#[derive(Debug)]
struct Rectangle {
    width: u32,
    height: u32,
}

impl Rectangle {
    fn area(&amp;self) -&gt; u32 {
        self.width * self.height
    }
}

impl Rectangle {
    fn can_hold(&amp;self, other: &amp;Rectangle) -&gt; bool {
        self.width &gt; other.width &amp;&amp; self.height &gt; other.height
    }
}
</code></pre>
    <h3>六、枚举和模式匹配</h3>
    <p><strong>定义枚举</strong></p>
    <p>例如，这里我们定义了一个IP地址的枚举类型，由于IP地址的类型现在只有IPV4和IPV6两种，我们可以这样定义:</p>
    <pre><code class="language-rust">enum IpAddrKind{
    V4,
    V6,
}
</code></pre>
    <p><strong>使用枚举类型</strong></p>
    <pre><code class="language-rust">fn main(){
    let four = IpAddrKind::V4;
    let six = IpAddrKind::V6;
}
</code></pre>
    <p>现在，我们可以利用枚举和结构体来定义一个ip地址</p>
    <pre><code class="language-rust">enum IpAddrKind{
    V4,
    V6,
}
struct IpAddr{
    kind:IpAddrKind,
    address: String,
}


fn main() {
    let host = IpAddr {
        kind: IpAddrKind::V4,
        address: String::from(&quot;127.0.0.1&quot;),
    };
}
</code></pre>
    <p>虽然我们可以这样表示一个完整的IP地址，但是枚举提供了一种更加简介的方式，你不需要使用结构体就可以定义一个完整的ip地址</p>
    <pre><code class="language-rust">enum IpAddrKind{
    V4(String),
    V6(String),
}
fn main() {
    let home = IpAddress::V4(String::from(&quot;127.0.0.1&quot;));

}
</code></pre>
    <p>
        这里，我们看到枚举工作的细节:<strong>我们定义的每个枚举变量的名称也会成为构造枚举实例的函数，也就是说，IpAddress::V4()，是一个函数调用，他接收String参数并返回一个IpAddress的实例对象，我们通过定义枚举来自动获得次构造函数。</strong>
    </p>
    <p>使用枚举而不是结构体还有一个优点:每个变量可以有不同的类型和数量关联的数据，例如ipv4始终是由四个数字组成的字段，其值介于0~255，我们可以这样定义枚举类型:</p>
    <pre><code class="language-rust">enum IpAddr{
    V4(u8,u8,u8,u8),
    V6(String),
}
fn main(){
    let home  = IpAddr::V4(127,0,0,1);
}
</code></pre>
    <p>同样，枚举类型也是可以有impl块的，你可以在impl块中定义你想实现的方法。</p>
    <h4>6.1 Option枚举</h4>
    <p>标准库中有一个Option类型的枚举，由于Rust语言中没有null，但他有一个枚举值，可以对值存在或不存在的概念进行编码，次枚举是Option&lt;T&gt;，由标准库实现如下</p>
    <pre><code class="language-rust">enum Option&lt;T&gt;{
    None,
    Some(T),
}
</code></pre>
    <h5>6.1.1 获取Option内值的方法</h5>
    <p>**unwrap()**方法</p>
    <p>在确认Option不为None的情况下，可以用unwrap方法拆解出其中的值，并获取所有权。这里要注意的是，<strong>unwrap会消费Option本身，所以在unwrap之后，Option就不能再使用了。</strong></p>
    <pre><code class="language-rust">let a = Some(Box::new(5));
let d = a.unwrap();
println!(&quot;{}&quot;,d); // 5
</code></pre>
    <p>这里有一个所有权的限制，所以<strong>只有Option原始变量可以调用unwrap方法，其引用包括可变引用，均不能调用。</strong></p>
    <p>**take()**方法</p>
    <p><code>take()</code>方法可以从Option中取出值，为原来的Option变量留下None值，但原来的变量(指Option)还有效(实际上没什么用处，因为都是None了)。<strong>take方法的原始值或者引用必须为mut类型</strong>。
    </p>
    <pre><code class="language-rust">    let mut a = Some(Box::new(5));
    let mut b = &amp;mut a;
    let c = &amp;mut b;
    let d = c.take();
    println!(&quot;{:?}&quot;, d); // Some(5)
    println!(&quot;{:?}&quot;, c); // None
    println!(&quot;{:?}&quot;, a); // None
</code></pre>
    <p>上面的两个方法，都改变了Option变量本身，但是如果我们不改变或受到限制无法改变Option本身时，该怎么办?</p>
    <p>**as_ref()**方法</p>
    <p>该方法将对Option的引用变为对Option所包含对象的不可变引用，并且返回一个新的Option。对这个新的Option进行unwrap操作，可以获得原Option所包含对象的不可变引用。</p>
    <pre><code class="language-rust">\tlet a = Some(Box::new(5));
    let b: Option&lt;&amp;Box&lt;i32&gt;&gt; = a.as_ref();
    let c: &amp;Box&lt;i32&gt; = b.unwrap();
    println!(&quot;{}&quot;, c);      // 5
    println!(&quot;{:?}&quot;, b);    // Some(5)
    println!(&quot;{:?}&quot;, a);    // Some(5)
</code></pre>
    <p>需要注意的是:</p>
    <ul>
        <li>以上代码中没有改变原始变量a，所以a依然能够使用</li>
        <li>b为通过<code>as_ref</code>生成的一个新的Option，故对b进行unwrap，不影响a</li>
        <li>c为a或b的Box包装的不可变借用</li>
    </ul>
    <blockquote>
        <p>疑惑:这里的b在调用完unwrap之后依然能够使用，不知道为什么?</p>
        <p>如果<code>Option里</code>的类型实现了copy特性，那么这个Option在unwrap之后仍然可以使用，也可以对Option的引用unwrap，而<code>引用也是实现了copy(可变引用不实现)</code>，所以as_ref可以在unwrap后继续使用。
        </p>
    </blockquote>
    <p>所以这段代码也是可以运行的:</p>
    <pre><code class="language-rust">fn main() {
    let a = Some(Point { x: 5, y: 5 });
    let b = &amp;a;
    let c:Option&lt;&amp;Point&gt; = b.as_ref(); // 原因是这里Option内的类型为引用类型
    let e = &amp;c;
    let d = e.unwrap();

    println!(&quot;{:?}&quot;, d.x);
    println!(&quot;{:?}&quot;, c);
    println!(&quot;{:?}&quot;, e); //
    println!(&quot;{:?}&quot;, b);
    println!(&quot;{:?}&quot;, a);
}

#[derive(Debug)]
struct Point {
    x: i32,
    y: i32,
}
</code></pre>
    <p>**as_mut()**方法</p>
    <p>与<code>as_ref</code>类似，<code>as_mut</code>只是返回了Option包含的数据的<code>可变引用</code></p>
    <pre><code class="language-rust">    let mut a = Some(Point { x: 2, y: 3 });
    let b = a.as_mut();
    let d = b.unwrap();
    d.x += 10;
    d.y += 20;
    println!(&quot;{:#?}&quot;, d); // x = 12 ,y = 23
    println!(&quot;{:?}&quot;,a);\t// x = 12, y =23
</code></pre>
    <p>注意，与<code>as_ref</code>不同，<code>as_mut</code>在调用完<code>unwrap</code>之后无法继续使用了。</p>
    <pre><code class="language-rust">fn main(){
    let mut a = Some(Point{x:2,y:3});
    let b = a.as_mut();
    let d = b.unwrap();
    println!(&quot;{:#?}&quot;, d);
    println!(&quot;{:?}&quot;, b); // error borrow of moved value: \`b\`
}
</code></pre>
    <p><strong>这是因为可变引用没有实现copy特征</strong>。</p>
    <h4>6.2 match(匹配控制流结构)</h4>
    <p>Rust有一个非常强大的称为match的控制流结构，他允许您将一个值与一系列模式进行比较，然后根据匹配的模式执行代码。模式可以由文字值，变量名，通配符和许多其他东西组成，</p>
    <p>例如，我们创建一个硬币枚举类，然后使用match返回对应的硬币的面值</p>
    <pre><code class="language-rust">enum Coin{
    Penny,
    Nickel,
    Dime,
    Quarter,
}

impl Coin{
    fn value_in_cents(&amp;self)-&gt;u8{
    match self{
        Coin::Penny =&gt; 1,
        Coin::Nickel =&gt; 5,
        Coin::Dime =&gt; 10,
        Coin::Quarter =&gt; 25,
     }
    }
}
fn main(){
    let coin = Coin::Dime;
    let value = coin.value_in_cents();
    println!(&quot;value = {}&quot;,value); // 10
}
</code></pre>
    <p>对于match，在不列出所有结果的情况下，如果你不设置一个默认值，你将无法编译，这是由于对于其他没列出的情况，match不知道如何去匹配他们，对于默认操作，可以这样设置</p>
    <pre><code class="language-rust">fn value_match(num:u8)-&gt;u8{
    match num{
        3 =&gt; three(),
        5 =&gt; five(),
        other =&gt; other(),
        // 或者
        // _ =&gt; other(),
    }
}
</code></pre>
    <p>其中 <code>other</code>和 <code>_</code>所能表示的是一样的。</p>
    <h4>6.3 带if-let的简明控制流程</h4>
    <p>对于以下这段程序</p>
    <pre><code class="language-rust">fn main() {
    let config_max = Some(3u8);
    match config_max {
        Some(max) =&gt; println!(&quot;The maximum is configured to be {}&quot;, max),
        _ =&gt; (),
    }
}

</code></pre>
    <p>对于这段代码来说，我们只希望当结果为some时触发操作，对于None值我们不想做任何操作，但是为了满足匹配表达式，我们必须在处理完一个变量后添加 <code>_=&gt;(),</code></p>
    <p>但是现在，我们可以使用 <code>if-let</code>以更简短的方式来优化这段代码</p>
    <pre><code class="language-rust">fn main() {
    let config_max = Some(3u8);
    if let Some(max) = config_max {
        println!(&quot;The maximum is configured to be {}&quot;, max);
    }
}

</code></pre>
    <p>语法 <code>if-let</code>采用一个模式和一个表达式，用等号分隔，他的工作方式与匹配相同，其中表达式被指定给匹配，模式是他的第一臂。</p>
    <p>在这段代码中，模式是 <code>Some(max)</code>，max绑定到Some内的值，然后，我们可以在 <code>if-let</code>拦网的主体中使用max，方法与在相应的 <code>match</code>中使用max相同，如果值与模式不匹配，if-let块中的代码不会运行。
    </p>
    <pre><code class="language-rust"> let config_max:Option&lt;u8&gt; = None;
    if let Some(max) = config_max{
        println!(&quot;the maximum is configured to be {}&quot;, max);
    }
</code></pre>
    <p>上面这段代码将不会输出字符串</p>
    <p>使用 <code>if-let</code>的好处是你可以更少的输入，更少的缩进和更少的样板代码，但是缺点是你无法对匹配的其他值进行处理。</p>
    <p>但是，我们可以通过else语句来对剩下的所有不能匹配的值来进行处理</p>
    <pre><code class="language-rust">let coin = Coin::Dime;
    if let Coin::Quarter(state) = coin{
        println!(&quot;State quarter from : {:?}&quot;, state);
    }else{
        println!(&quot;the Coin is not Quarter&quot;);
    }
</code></pre>
    <h4>6.4 matches! 宏</h4>
    <p>Rust标准库中提供了一个非常实用的宏:<code>matches!</code>，他可以将一个表达式跟模式进行匹配，然后返回匹配的结果 <code>true</code>or <code>false</code>。</p>
    <p>例如:有一个动态数组，里面存有以下枚举</p>
    <pre><code class="language-rust">enum MyEnum {
    Foo,
    Bar
}

fn main() {
    let v = vec![MyEnum::Foo,MyEnum::Bar,MyEnum::Foo];
}

</code></pre>
    <p>现在想要对其中的元素进行过滤，你可能想这么写:</p>
    <pre><code class="language-rust">v.iter().filter(|x| x == MyEnum::Foo);
</code></pre>
    <p>但实际上这么写是无法编译的，因为你无法将 <code>x</code>直接跟一个枚举成员进行比较，这时你就可以使用 <code>matches!</code>宏来解决</p>
    <pre><code class="language-rust">v.iter().filter(|x|matches!(x,MyEnum::Foo));
</code></pre>
    <h4>8.4 while let 条件循环匹配</h4>
    <p>一个与 <code>if let</code>类似创尔结构是 <code>while let</code>条件循环，它允许只要模式匹配就一直进行 <code>while</code>循环。例如:</p>
    <pre><code class="language-rust">let mut stack = Vec::new();
stack.push(1);
stack.push(2);
stack.push(3);

// pop() 从数组尾部弹出元素
while let Some(top) = stack.pop() {
    println!(&quot;{}&quot;,top);
}
</code></pre>
    <p>上面的代码会将stack数组所有的元素从后往前依次打印出来，知道数组为空，匹配失败，跳出循环。</p>
    <p>你也可以使用 <code>loop + if let</code>的方式来实现这个功能。</p>
    <h3>七、模块管理</h3>
    <p><img src="https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com//image-20221101093349035.png" alt="image-20221101093349035"/></p>
    <p>对于这样的模块结构，我们需要在main中定义</p>
    <pre><code class="language-rust">use crate::garden::vegetables::Asparagus;

pub mod garden;

fn main() {
    let plant = Asparagus {};
    println!(&quot;Hello, world! the plant is {:#?}&quot;,plant);
}

</code></pre>
    <p>src/lib.rs</p>
    <pre><code class="language-rust">mod front_of_house {
    pub mod hosting {
        pub fn add_to_waitlist() {
            println!(&quot;this is add_to_waitlist function&quot;);
        }

        fn seat_at_table() {
            println!(&quot;this is seat_at_table function&quot;);
        }
    }

    mod serving {
        fn take_order() {}

        fn server_order() {}

        fn take_payment() {}
    }
}

fn deliver_order() {}

mod back_of_house {

    fn fix_incorrect_order() {
        cook_order();
        super::deliver_order();
    }

    fn cook_order() {
        println!(&quot;this is cook_order()&quot;);
    }

    #[derive(Debug)]
    pub struct Breakfast {
        pub toast: String,
        seasonal_fruit: String,
    }

    impl Breakfast {
        pub fn summer(toast: &amp;str) -&gt; Breakfast {
            Breakfast {
                toast: String::from(toast),
                seasonal_fruit: String::from(&quot;peaches&quot;),
            }
        }
    }
}

pub fn eat_at_restaurant() {
    // 绝对路径
    //crate::lib::front_of_house::hosting::add_to_waitlist();
    // 相对路径
    front_of_house::hosting::add_to_waitlist();
    let mut meal = back_of_house::Breakfast::summer(&quot;Rye&quot;);
    meal.toast = String::from(&quot;Wheat&quot;);
    println!(&quot;the meal is {:#?}&quot;, meal);
    println!(&quot;I'd like {} toast please!&quot;, meal.toast);

}

fn main() {


}
</code></pre>
    <h4>7.1 使用use 关键字将路径引入范围</h4>
    <pre><code class="language-rust">mod front_of_house {
    pub mod hosting {
        pub fn add_to_waitlist() {}
    }
}

use crate::front_of_house::hosting;

pub fn eat_at_restaurant() {
    hosting::add_to_waitlist();
}

</code></pre>
    <p>在这段代码中，我们使用了 <code>use</code>关键字将hosting 的路径引入，之后我们就可以在 <code>eat_at_restaurant</code>中直接使用hosting了。</p>
    <p>但是，如果我们将 <code>eat_at_restaurant</code>移动到另一个模块中，那么这个use关键字引入的路径将不起作用，例如:</p>
    <pre><code class="language-rust">mod front_of_house {
    pub mod hosting {
        pub fn add_to_waitlist() {}
    }
}

use crate::front_of_house::hosting;

mod customer {
    pub fn eat_at_restaurant() {
        hosting::add_to_waitlist();
    }
}

</code></pre>
    <p>上面这段代码将无法编译</p>
    <p>当我们引用了两个具有相同名称但不同父模块的类型时</p>
    <pre><code class="language-rust">use std::fmt;
use std::io;

fn function1() -&gt; fmt::Result {
    // --snip--
    Ok(())
}

fn function2() -&gt; io::Result&lt;()&gt; {
    // --snip--
    Ok(())
}

</code></pre>
    <p>例如这里，我们看到，fmt和io中都有一个Result，如果我们指定 <code>use std::fmt::Result</code>时也指定了 <code>use std::io::Result</code>时，Rust将不知道我们使用的是哪个Result</p>
    <p>这时，我们可以为类型提供别名，这是use提供给我们的解决办法</p>
    <pre><code class="language-rust">use std::fmt::Result;
use std::io::Result as IoResult;
</code></pre>
    <p>在此之前，我们提到了use不能在当前模块之外使用，但是，现在，我们可以使用pub关键字修饰use ，这样，即使你在模块外使用这个路径，rust也能够找到这个use的定义，</p>
    <pre><code class="language-rust">mod front_of_house {
    pub mod hosting {
        pub fn add_to_waitlist() {}
    }
}

pub use crate::front_of_house::hosting;

pub fn eat_at_restaurant() {
    hosting::add_to_waitlist();
}

</code></pre>
    <h4>7.2 典型的Package结构</h4>
    <p>一个真实项目中典型的Package，会包含多个二进制包，这些包文件被放在 <code>src/bin</code>目录下，每一个文件都是独立的二进制包，同时也会包含一个库包，该包只能存在一个 <code>src/bin</code>。</p>
    <pre><code class="language-rust">.
├── Cargo.toml
├── Cargo.lock
├── src
│   ├── main.rs
│   ├── lib.rs
│   └── bin
│       └── main1.rs
│       └── main2.rs
├── tests
│   └── some_integration_tests.rs
├── benches
│   └── simple_bench.rs
└── examples
    └── simple_example.rs
</code></pre>
    <ul>
        <li>唯一库包: <code>src/lib.rs</code></li>
        <li>默认二进制包: <code>src/main.rs</code>，编译后生成的可执行文件与Package同名</li>
        <li>其余二进制包: <code>src/bin/main1.rs</code>和 <code>src/bin/main2.rs</code>，他们会分别生成一个文件同名的二进制可执行文件</li>
        <li>集成测试文件: tests目录下</li>
        <li>基准性能测试: <code>benchmark</code>文件: <code>benches</code>目录下</li>
        <li>项目示例: <code>examples</code>目录下</li>
    </ul>
    <h4>7.3 模块 module</h4>
    <ul>
        <li>使用 <code>mod</code>关键字来创建新模块，后面紧跟着模块名称</li>
        <li>模块可以嵌套</li>
        <li>模块中可以定义各种Rust类型，例如函数，结构体，枚举，特征等</li>
        <li>所有模块均定义在同一个文件中</li>
    </ul>
    <p><strong>用路径引用模块</strong></p>
    <p>想要调用一个函数，就需要知道他的路径，在Rust中，这种路径有两种形式:</p>
    <ul>
        <li><strong>绝对路径</strong>，从包根开始，路径名以包名或者 <code>crate</code>开头</li>
        <li><strong>相对路径</strong>，从当前模块开始，以 <code>self</code>，<code>super</code>或当前的标识符作为开头</li>
    </ul>
    <p><strong>代码可见性</strong></p>
    <p>对于我们在同一中模块中的方法，即使当前模块是私有的，你也可以访问他，例如:</p>
    <pre><code class="language-rust">mod front_of_house{
   pub mod hosting {
       pub fn add_to_waitlist(){}
        fn seat_at_table(){}
    }
    mod serving {
        fn take_order(){}
        fn serve_order(){}
        fn tabke_payment(){}
    }
}
pub fn eat_at_restaurant(){
    // 绝对路径
    crate::front_of_house::hosting::add_to_waitlist();
    // 相对路径
    front_of_house::hosting::add_to_waitlist();
}
</code></pre>
    <p>即使 <code>front_of_house</code>是私有的，但是我们还是可以在公共方法中引入他，但是对于 <code>front_of_house</code>下的方法或者模块，我们却无法访问，除非他被显式的标为 <code>pub</code>。</p>
    <p>Rust处于安全的考虑，默认情况下，所有的类型都是私有化的，所以在Rust中有这样一个定义:</p>
    <p><strong>在Rust中，父模块完全无法访问子模块中的私有项，但是子模块却可以访问父模块，父父..模块的私有项。</strong></p>
    <p>一个模块被指定为 <code>pub</code>并不代表它子下的内容为 <code>pub</code>，只是表示该模块可以被引用。</p>
    <p>如果需要继续引用该模块中的方法，需要将该方法指定为 <code>pub</code></p>
    <p><strong>使用super引用模块</strong></p>
    <p><code>super</code>表示的是父模块为开始的引用方式。</p>
    <h4>7.3 使用use及受限可见性</h4>
    <p><strong>引入项再导出</strong></p>
    <p>当外部的模块项 <code>A</code>被引入到当前模块中时，他的<strong>可见性自动被设置为私有的</strong>，如果你希望允许其他外部代码引用我们的模块 <code>A</code>，那么可以对他进行在导出:</p>
    <pre><code class="language-rust">mod front_of_house{
    pub mod hosting{
        pub fn add_to_waitlist(){}
    }
}
pub use crate::front_to_house::hosting;
pub fn eat_at_restaurant(){
    hosting::add_to_waitlist();
    hosting::add_to_waitlist();
}
</code></pre>
    <p>如上，使用 <code>pub use</code>即可实现对外可见。</p>
    <p>但，如果想实现只对特定模块可见呢，我们可以这样写:</p>
    <pre><code class="language-rust">pub mod a {
    pub const I: i32 = 3;

    fn semisecret(x: i32) -&gt; i32 {
        use self::b::c::J;
        x + J
    }

    pub fn bar(z: i32) -&gt; i32 {
        semisecret(I) * z
    }
    pub fn foo(y: i32) -&gt; i32 {
        semisecret(I) + y
    }

    mod b {
        pub(in crate::a) mod c {
            pub(in crate::a) const J: i32 = 4;
        }
    }
}
</code></pre>
    <p>通过 <code>pub(in crate::a)</code>就可以实现只对模块a起作用，而不对外暴露。</p>
    <p>这种语法表示<strong>限制可见性语法</strong></p>
    <ul>
        <li><code>pub</code>表示可见性无限制</li>
        <li><code>pub(crate)</code>表示在当前包内可见</li>
        <li><code>pub(self)</code>表示在当前模块可见</li>
        <li><code>pub(super)</code>表示在父模块可见</li>
        <li><code>pub(in &lt;path&gt;)</code>表示在某个路径代表的模块中可见，其中 <code>path</code>必须是父模块或者祖先模块。</li>
    </ul>
    <h3>八、常见集合</h3>
    <p>
        Rust标准库中包含一系列被称为**集合(collections)**的非常有用的数据结构，大部分其他数据类型都代表一个特定的值，不过集合可以包含多个值。不同于内建的数组和元组类型，这些集合指向的数据是存储在堆上的，这意味着数据的数据不必再编译时就已知。</p>
    <p>有三个在Rust程序中被广泛使用的集合:</p>
    <ul>
        <li>vector:允许我们一个挨着一个地存储一系列数据可变的值</li>
        <li>字符串(string):是字符的集合，我们之前见过String类型</li>
        <li>HashMap:哈希表，允许我们将值与一个特定的键绑定。</li>
    </ul>
    <h4>8.1 vector</h4>
    <p>vector集合的类型为 <code>Vec&lt;T&gt;</code></p>
    <p><strong>新建vector</strong></p>
    <pre><code class="language-rust">let v:Vec&lt;i32&gt; = Vec::new();
</code></pre>
    <p>在我们新建vector时，由于我们还没有对vector中添加值，所以Rust并不知道我们需要添加什么类型的数据，所以我们需要对Vector进行类型注解。</p>
    <p>通常，我们会用初始值来创建一个 <code>Vec&lt;T&gt;</code>而Rust会推断出存储的类型，所以很少会需要这些类型注解，为了方便Rust提供了 <code>vec!</code>宏，这个宏会根据我们提供的值来创建一个新的Vector
    </p>
    <pre><code class="language-rust">let v = vec![1,2,3];
</code></pre>
    <p><strong>添加数据</strong></p>
    <pre><code class="language-rust">let mut v = Vec::new();
v.push(5);
v.push(6);
v.push(7);
v.push(8);

</code></pre>
    <p>类似于任何其他的struct，vector在其离开作用域时会被释放</p>
    <pre><code class="language-rust">{
    let v = vec![1,2,3,4];
    // 处理变量
} // &lt;- 这里v离开作用域并被丢弃
</code></pre>
    <p><strong>获取数据</strong></p>
    <p>有两种方法可以引用存储在Vector中的值</p>
    <ul>
        <li>通过索引</li>
        <li>使用get方法</li>
    </ul>
    <p>使用索引</p>
    <pre><code class="language-rust">let v = vec![1,2,3,4,5];
// 使用索引
let third: &amp;i32 = &amp;v[2];
println!(&quot;the third element is {}&quot;,third);
// 使用get方法
let third: Option&lt;&amp;i32&gt; = v.get(2);
match third{
    Some(third) =&gt; println!(&quot;the third element is {}&quot;,third),
    None =&gt; println!(&quot;there is no third element&quot;),
}

</code></pre>
    <p>需要注意的是，与使用索引不同，使用get方法返回的不是第三个元素所在的地址，而是一个 <code>Option&lt;&amp;i32&gt;</code>的枚举变量，这样的好处是可以防止你访问超出数组长度的索引而导致程序崩溃，例如:</p>
    <pre><code class="language-rust">fn main(){
    let v = vec![1,2,3,4,5];
    let over_index: &amp;i32 = &amp;v[100];
    let over_index:Option&lt;&amp;i32&gt; = v.get(100);
}
</code></pre>
    <p>上面的程序在运行到第三行时，程序会直接崩溃无法运行，而当你使用get方法区访问时，程序不会有任何异常。</p>
    <p>还记得我们之前说过的，**同一个范围内不能同时存在可变和不可变的引用。**这同样适用于vector，例如:</p>
    <pre><code class="language-rust">let mut v = vec![1,2,3,4];
let first = &amp;v[0];
v.push(5);
println!(&quot;the first element is: {}&quot;, first);
</code></pre>
    <p>当你尝试在获取到第一个元素的时候，接着在末尾继续插入一个元素的时候，这时，rust编译器将会告诉你，不能同时持有可变和不可变变量，你必须在first变量使用前或者使用完超出范围后才能重新获取v的所有权。</p>
    <h4>8.2 String</h4>
    <p>在之前，我们学习了两种字符串的形式，一种是 <code>&amp;str</code>，它是字符串切片，另一种是 <code>String</code>,它是创建在堆上的字符串。</p>
    <pre><code class="language-rust">// 在堆上创建新空字符串
let mut s = String::new();
</code></pre>
    <p>我们可以通过rust的函数将字符串切片转换为String</p>
    <pre><code class="language-rust">\tlet data = &quot;this is a sting&quot;;
    let s = data.to_string();
    // 上面的代码与下面的等同
    let s = &quot;this is a string&quot;.to_string();
    // s 也可以这样创建，这是直接从堆中创建字符串
    let s = String::from(&quot;this is a string&quot;);
    println!(&quot;{s}&quot;);
</code></pre>
    <p><strong>追加元素</strong></p>
    <pre><code class="language-rust">fn main() {
    let mut s = String::from(&quot;Hello &quot;);
    s.push('r');
    println!(&quot;追加字符 push() -&gt; {}&quot;, s);

    s.push_str(&quot;ust!&quot;);
    println!(&quot;追加字符串 push_str() -&gt; {}&quot;, s);
}
</code></pre>
    <p><strong>插入元素</strong></p>
    <pre><code class="language-rust">fn main() {
    let mut s = String::from(&quot;Hello rust!&quot;);
    s.insert(5, ',');
    println!(&quot;插入字符 insert() -&gt; {}&quot;, s);
    s.insert_str(6, &quot; I like&quot;);
    println!(&quot;插入字符串 insert_str() -&gt; {}&quot;, s);
}
</code></pre>
    <p><strong>拼接字符串</strong></p>
    <pre><code class="language-rust"> // 组合字符串是最简单和直观的方法，尤其是在字符串和非字符串混合的情况下。
 fn main() {
    let name = &quot;world!&quot;;
    let hw = format!(&quot;Hello {}!&quot;, name);
    println!(&quot;{:#?}&quot;, hw);
 }

 // 在追加字符串的时候，可以使用\`push_str\`方法,\`push_str\`性能比\`format!\`更好
 fn main() {
    let mut hw = String::new();
    hw.push_str(&quot;hello&quot;);
    hw.push_str(&quot; world!&quot;);
    println!(&quot;{:#?}&quot;, hw);
}

 // 通过\`concat()\`方法将字符串数组拼接成一个字符串
 fn main() {
    let hw = [&quot;hello&quot;, &quot; &quot;, &quot;world!&quot;].concat();
    println!(&quot;{:#?}&quot;, hw);
 }

 // 通过\`join()\`方法将字符串数组拼接成一个字符串
 fn main() {
    let hw_1 = [&quot;hello&quot;, &quot;world!&quot;].join(&quot;&quot;);
    println!(&quot;{:#?}&quot;, hw_1);
    // 输出：
    // helloworld!

    // 使用\`join()\`方法在拼接字符串时添加或指定字符
    let hw_2 = [&quot;hello&quot;, &quot;world!&quot;].join(&quot;+&quot;);
    println!(&quot;{:#?}&quot;, hw_2);
    // 输出：
    // hello+world!
 }

 // 使用\`collect()\`方式对数组中的字符串进行拼接
 fn main() {
    let hw = [&quot;hello&quot;, &quot; &quot;, &quot;world!&quot;];
    let res: String = hw.iter().map(|x| *x).collect();
    println!(&quot;{:#?}&quot;, res);
 }

 // 使用符号\`+\`进行字符串拼接
 fn main() {
    let hw_1 = &amp;(String::from(&quot;hello&quot;) + &amp;String::from(&quot; &quot;) + &amp;String::from(&quot;world!&quot;));
    println!(&quot;{:#?}&quot;, hw_1);

    let hw_2 = &amp;(String::from(&quot;hello&quot;) + &quot; &quot; + &quot;world!&quot;);
    println!(&quot;{:#?}&quot;, hw_2);

    let hw_3 = &amp;(&quot;hello&quot;.to_owned() + &quot; &quot; + &quot;world!&quot;);
    println!(&quot;{:#?}&quot;, hw_3);

    let hw_4 = &amp;(&quot;hello&quot;.to_string() + &quot; &quot; + &quot;world!&quot;);
    println!(&quot;{:#?}&quot;, hw_4);
 }

</code></pre>
    <p><strong>替换元素</strong></p>
    <ol>
        <li>replace</li>
    </ol>
    <p>replace方法接收两个参数，第一个参数是要被替换的字符串，第二个参数是新的字符串。该方法是返回一个新的字符串，而不是操作原来的字符串。</p>
    <pre><code class="language-rust">fn main (){
    let string_replace = String::from(&quot;I like rust,Learning rust&quot;);
    let new_string_replace = string_replace.replace(&quot;rust&quot;,&quot;RUST&quot;);
    dbg!(new_string_replace);
}
</code></pre>
    <ol start="2">
        <li>replacen</li>
    </ol>
    <p>replacen方法接收三个参数，前两个参数与replace方法一样，第三个参数则表示替换的个数，该方法是返回一个新的字符串，而不是操作原来的字符。</p>
    <pre><code class="language-rust">fn main(){
    let string_replace = &quot;i like rust.Learning rust is my favourite&quot;;
    let new_string_replacen = string_replace.replacen(&quot;rust&quot;,&quot;RUST&quot;,1)'
    dbg!(&quot;new_string_replacen&quot;);
}
</code></pre>
    <ol start="3">
        <li>replace_range</li>
    </ol>
    <p>该方法只适用于String类型，<code>replace_range()</code>方法接收两个参数，<strong>第一个参数是要替换字符串的范围</strong>，<strong>第二个参数是新的字符串</strong>，该方法是操作原来的字符串，不会返回新的字符串。所以操作的字符串需要使用
        <code>mut</code>进行修饰。</p>
    <pre><code class="language-rust">fn main(){
    let mut str = String::from(&quot;i like rust&quot;);
    str.replace_range(7..8,&quot;R&quot;);
    dbg!(str);
}
</code></pre>
    <p><strong>删除字符串</strong></p>
    <p>与字符串删除的方法有四个，</p>
    <ul>
        <li>pop(): 删除并返回字符串的最后一个字符，该方法是操作原来的字符串，返回值是一个Option类型</li>
        <li><strong>remove(i32)</strong>: 删除并返回字符串中指定位置的字符，该方法是操作原来的字符串，但是存在返回值，返回值是删除位置的字符串，参数需要是合法的字符边界</li>
        <li><strong>truncate(i32)</strong>: 删除字符串中从指定位置开始到结尾的全部字符，该方法是直接操作原来的字符串，无返回值。</li>
        <li><strong>clear()</strong>: 清空字符串，调用后删除字符串中的所有字符，相当于 <code>truncate(0)</code></li>
    </ul>
    <p><strong>迭代集合中的元素</strong></p>
    <p>使用for循环遍历</p>
    <pre><code class="language-rust">fn main() {
    let v = vec![100, 32, 57];
    for i in &amp;v {
        println!(&quot;{}&quot;, i);
    }
}
</code></pre>
    <p><strong>提前分配内存</strong></p>
    <p>在使用Vec的时候，如果没有提前给他一个分配的空间大小，Vec会使用一个默认的大小来创建，当空间不够用时，会重新分配内存，将原来的空间的数据拷贝并移动到新的内存空间，而Vec提前分配内存的方法为:</p>
    <pre><code class="language-rust">Vec::with_capacity(capacity);
// 例如
let mut vec = Vec::with_capacity(100);
for i in 0..100{
    vec.push(i); // 这时不会发生动态分配内存，因为空间大小时足够的
}
</code></pre>
    <p>和vector一样，String也可以在字符串组中添加字符串</p>
    <pre><code class="language-rust">let mut s = String::from(&quot;foo&quot;);
s.push_str(&quot;bar&quot;);
// 或者
// let s2 = &quot;bar&quot;;
// s.push_str(s2);
</code></pre>
    <p>使用+运算符连接字符串</p>
    <pre><code class="language-rust">let s1 = String::from(&quot;str1&quot;);
    let s2 = String::from(&quot;str2&quot;);
    let s3 = s1 + &amp;s2; // 注意，这里的s1并没有传入引入，而是将所有权也传了进去
    // 这里，s1将无法使用，s2可以继续使用
    // println!(&quot;{}&quot;, s1); //error
    println!(&quot;{}&quot;, s2);
</code></pre>
    <p>这里的+运算符实际上是标准库的一个add 方法</p>
    <p><code>fn add(self, s: &amp;str) -&gt; String {...}</code></p>
    <p>它将自身和另一个字符串引用连接并返回一个String</p>
    <p>但是注意一个问题，我们传进去的 <code>&amp;s2</code>的类型为 <code>&amp;String</code>而不是 <code>&amp;str</code>，那么为什么我们能够编译成功呢?</p>
    <p>我们能够在要添加的调用中使用 <code>&amp;s2</code>的原因是编译器可以将 <code>&amp;String</code>参数强制转换为 <code>&amp;str</code>，当我们调用add方法时，Rust做了一个 <code>deref</code>强制，将这里的
        <code>&amp;s2</code>转换为 <code>&amp;s2[..]</code>.</p>
    <p>如果我们需要连接多个字符串，+运算符的定位会变得很难处理</p>
    <pre><code class="language-rust">let s1 = String::from(&quot;tic&quot;);
    let s2 = String::from(&quot;tac&quot;);
    let s3 = String::from(&quot;toe&quot;);
    //let s4 = s1 + &quot;-&quot; + &amp;s2 + &quot;-&quot; + &amp;s3;
    // 我们可以通过使用!宏来方便的连接多个字符串
    let s4 = format!(&quot;{}-{}-{}&quot;, s1, s2, s3);
    // 由这种方式的连接字符串并没有使用所有权，所以你之后依然可以继续使用这些字符串
    println!(&quot;{}&quot;, s2);
    println!(&quot;{}&quot;, s4);
</code></pre>
    <p>需要注意的是，rust不提供字符串使用索引去获取字符串字符的方法，其中有几个原因</p>
    <ul>
        <li>
            由于Rust字符串使用的是UTF-8编码，而对于不同的语言，他们在计算机中所占的字节也不同，所以rust无法对于所有的用户返回他们所期望的值，所以rust为了避免意外并导致可能无法理解发现的错误，Rust根本不编译此代码。
        </li>
        <li>第二个原因是:由于索引操作通常需要恒定的时间，但无法保证String的性能，因为Rust必须从开始到索引遍历内容，以确定有多要个有效字符。</li>
    </ul>
    <p>而当你确实需要使用索引来创建字符串片段，Rust会要求你更加具体，你可以使用带范围的 <code>[]</code>来创建包含特定字节的字符串片段，而不是使用单个数字的索引，例如:</p>
    <pre><code class="language-rust">let str = &quot;Hello,World&quot;;
    let s = &amp;str[0..1]; // H
    let s = &amp;str[1..3]; // el
    println!(&quot;{}&quot;, s);
</code></pre>
    <p>这有点类似于其他语言的 <code>subString</code>截取字符串片段方法</p>
    <p><strong>遍历字符串</strong></p>
    <p>对于字符串片段进行操作的最佳方法是明确你想要字符还是字节，对于单个的Unicode字符，请使用 <code>chars()</code>方法，而对于字节，请使用 <code>bytes()</code>方法，例如:</p>
    <pre><code class="language-rust">//let str = &quot;Здравствуйте&quot;;
    let str = String::from(&quot;Здравствуйте&quot;);
    for s in str.chars(){
        println!(&quot;{}&quot;, s);
    }
    for s in str.bytes(){
        println!(&quot;{}&quot;, s);
    }
</code></pre>
    <h4>8.3 HashMap</h4>
    <p>跟其他语言一样，<code>HashMap&lt;K，V&gt;</code>使用哈希函数存储K类型键，到V类型的值的映射。</p>
    <p>在使用HashMap前，你需要添加标准库中Hashmap的引用，在我们的三个常用集合中，这一个是最不常用的，因此他不包含在序言中自动引入范围的特性中。</p>
    <pre><code class="language-rust">use std::collections::HashMap;
</code></pre>
    <p><strong>创建HashMap并且添加数据</strong></p>
    <p>和创建动态数组Vec的方法类似,可以使用 <code>new</code>方法来创建 <code>HashMap</code>，然后通过 <code>insert</code>方法来插入数据。</p>
    <pre><code class="language-rust">use std::collections::HashMap;
// 创建一个HashMap
let mut m_gems = HashMap::new();
m_gems.insert(&quot;红宝石&quot;,1);
m_gems.insert(&quot;蓝宝石&quot;,2);
m_gems.insert(&quot;绿宝石&quot;,3);
</code></pre>
    <p><strong>动态分配内存</strong></p>
    <p>和Vec一样，HashMap也有提前分配内存的方法，</p>
    <pre><code class="language-rust">HashMap::with_capacity(capacity);
</code></pre>
    <p>动态变化内存</p>
    <pre><code class="language-rust">
use std::collections::HashMap;
fn main() {
    let mut map: HashMap&lt;i32, i32&gt; = HashMap::with_capacity(100);
    map.insert(1, 2);
    map.insert(3, 4);
    // 事实上，虽然我们使用了 100 容量来初始化，但是 map 的容量很可能会比 100 更多
    assert!(map.capacity() &gt;= 100);

    // 对容量进行收缩，你提供的值仅仅是一个允许的最小值，实际上，Rust 会根据当前存储的数据量进行自动设置，当然，这个值会尽量靠近你提供的值，同时还可能会预留一些调整空间

    map.shrink_to(50);
    assert!(map.capacity() &gt;= 50);

    // 让 Rust  自行调整到一个合适的值，剩余策略同上
    map.shrink_to_fit();
    assert!(map.capacity() &gt;= 2);
    println!(&quot;Success!&quot;)
}

</code></pre>
    <p><strong>通过数组添加数据</strong></p>
    <p>现在，我们有一个数组，其中的元素是由&lt;String，u32&gt;组成的元组，我们想要将其添加到HashMap中，并使用String作为key，u32作为value</p>
    <pre><code class="language-rust">use std::collections::HashMap;
fn main(){
    let teams_list = vec![
        (&quot;中国队&quot;.to_string(),100),
        (&quot;日本队&quot;.to_string(),10),
        (&quot;美国队&quot;.to_string(),50),
    ];
    let mut tems_map = HashMap::new();
    for team in &amp;tems_list{
        teams_map.insert(&amp;team.0,team.1);
    }
}
</code></pre>
    <p>不过这种方法，实现起来过于复杂了，Rust提供了一种更为简单的方式来实现这个功能，就是先将vec转换为迭代器，接着通过 <code>collect()</code>方法，将迭代器中的元素收集后，转换为HashMap</p>
    <pre><code class="language-rust">use std::collections::HashMap;
fn main(){
    let teams_list = vec![
        (&quot;中国队&quot;.to_string(),100),
        (&quot;日本队&quot;.to_string(),10),
        (&quot;美国队&quot;.to_string(),50),
    ];
   \tlet teams_map: HashMap&lt;&amp;String,i32&gt; = teams_list.into_iter().collect();
}
</code></pre>
    <p><strong>所有权转移</strong></p>
    <p>注意:在给HashMap添加数据时和其他Rust类型一样:</p>
    <ul>
        <li>如果该类型没有实现 <code>Copy</code>特征，那么该类型 <code>所有权</code>将被转移给HashMap。</li>
        <li>如果该类型实现了 <code>Copy</code>特征，那么该类型会被复制进HashMap，因此无所谓所有权。</li>
    </ul>
    <p><strong>获取元素</strong></p>
    <p>通过 <code>get()</code>方法可以获取元素</p>
    <pre><code class="language-rust">let map = HashMap::new();
map.insert(&quot;hello&quot;,&quot;world&quot;);
let value:Option&lt;&amp;str&gt; = map.get(&quot;hello&quot;);
</code></pre>
    <p>需要注意的是: get方法返回一个Option<code>&lt;T&gt;</code>类型数据，当查询不到时，会返回一个None，查询到时，返回Some<code>&lt;T&gt;</code>。</p>
    <p>通过索引来获取</p>
    <pre><code class="language-rust">let map = HashMap::new();
map.insert(&quot;hello&quot;,1);
let val: i32 = map[&quot;hello&quot;];
</code></pre>
    <p>还可以通过循环遍历key/value</p>
    <pre><code class="language-rust">use std::collections::HashMap;

let mut scores = HashMap::new();

scores.insert(String::from(&quot;Blue&quot;), 10);
scores.insert(String::from(&quot;Yellow&quot;), 50);

for (key, value) in &amp;scores {
    println!(&quot;{}: {}&quot;, key, value);
}
</code></pre>
    <p><strong>更新HashMap中的值</strong></p>
    <pre><code class="language-rust">fn main() {
    use std::collections::HashMap;

    let mut scores = HashMap::new();

    scores.insert(&quot;Blue&quot;, 10);

    // 覆盖已有的值，并返回旧值
    let old = scores.insert(&quot;Blue&quot;, 20);
    assert_eq!(old, Some(10));

    // 查询新插入的值
    let new = scores.get(&quot;Blue&quot;);
    assert_eq!(new, Some(&amp;20));

    // 查询Yellow对应的值，若不存在则插入新值
    let v:&amp;mut i32 = scores.entry(&quot;Yellow&quot;).or_insert(5);
    assert_eq!(*v, 5); // 不存在，插入5

    // 查询Yellow对应的值，若不存在则插入新值
    let v:&amp;mut i32 = scores.entry(&quot;Yellow&quot;).or_insert(50);
    assert_eq!(*v, 5); // 已经存在，因此50没有插入
}
</code></pre>
    <p><strong>HashMap Key的限制</strong></p>
    <p>任何实现了 <code>Eq</code>和 <code>Hash</code>特征的类型都可以用于 <code>Hashmap</code>的key，包括:</p>
    <ul>
        <li>bool</li>
        <li>int，uint以及他们的变体，例如u8，i32等</li>
        <li>String和&amp;str(当HashMap的key是String类型时，你其实可以使用&amp;str配合get方法进行查询)</li>
    </ul>
    <p>主要注意的是，f32和f64并没有实现 <code>Hash</code>，原因是浮点数精度的问题会导致他们无法进行相等比较。</p>
    <p>如果一个集合类型的所有字段都实现了 <code>Eq</code>和 <code>Hash</code>，那该集合类型会自动实现 <code>Eq</code>和 <code>Hash</code>特征，例如，Vec<code>&lt;T&gt;</code>需要实现 <code>Hash</code>，那么首先需要T实现Hash。
    </p>
    <h3>九、泛型(Generics)和特征(Trait)</h3>
    <h4>9.1 泛型</h4>
    <p>实际上，泛型是一种多态，泛型的主要目的是为程序员提供编程的遍历，减少代码的臃肿，同时可以极大地丰富语言本身的表达能力，为程序员提供一个合适的通用炮管。</p>
    <p>使用泛型，有一个先决条件:必须在使用前对齐进行声明:</p>
    <pre><code class="language-rust">fn largest&lt;T&gt;(list: &amp;[T]) -&gt; T {...}
</code></pre>
    <p>这是一个实现传进来的数组切片的寻找最大数的一个泛型函数</p>
    <pre><code class="language-rust">fn largest&lt;T&gt;(list: &amp;[T]) -&gt; T {
    let mut largest = list[0];

    for &amp;item in list.iter() {
        if item &gt; largest {
            largest = item;
        }
    }

    largest
}

fn main() {
    let number_list = vec![34, 50, 25, 100, 65];

    let result = largest(&amp;number_list);
    println!(&quot;The largest number is {}&quot;, result);

    let char_list = vec!['y', 'm', 'a', 'q'];

    let result = largest(&amp;char_list);
    println!(&quot;The largest char is {}&quot;, result);
}

</code></pre>
    <p>但是实际上，我们现在还无法编译这段代码，这是因为在由于 <code>T</code>可以是任何类型，但并不是所有的类型都能进行比较的，因此上面的错误中，rust编译器会建议我们给 <code>T</code>添加一个类型限制: 使用
        <code>std::cmp::PartialOrd</code>特征(Trait)对 <code>T</code>进行限制。</p>
    <p>例如:</p>
    <pre><code class="language-rust">fn add&lt;T: std::ops::Add&lt;Output = T &gt;&gt;(a:T, b:T)-&gt; T {
    ...
}
</code></pre>
    <p>方法上也可以使用泛型</p>
    <pre><code class="language-rust">struct Point&lt;T&gt;{
    x:T,
    y:T,
}
impl&lt;T&gt; Point&lt;T&gt;{
    fn x(&amp;self) -&gt; &amp;T {
        &amp;self.x
    }
}
</code></pre>
    <p>使用泛型前，依然需要提前声明:<code>impl&lt;T&gt;</code></p>
    <p>除了结构体中的泛型参数，我们还能在该结构体的方法中定义额外的泛型参数，就跟泛型函数一样。</p>
    <pre><code class="language-rust">struct Point&lt;T, U&gt; {
    x: T,
    y: U,
}

impl&lt;T, U&gt; Point&lt;T, U&gt; {
    fn mixup&lt;V, W&gt;(self, other: Point&lt;V, W&gt;) -&gt; Point&lt;T, W&gt; {
        Point {
            x: self.x,
            y: other.y,
        }
    }
}

fn main() {
    let p1 = Point { x: 5, y: 10.4 };
    let p2 = Point { x: &quot;Hello&quot;, y: 'c'};

    let p3 = p1.mixup(p2);

    println!(&quot;p3.x = {}, p3.y = {}&quot;, p3.x, p3.y);
}

</code></pre>
    <p><strong>为具体的泛型类型实现方法</strong></p>
    <p>对于 <code>Point&lt;T&gt;</code>类型，你不仅能定义基于<code>&lt;T&gt;</code>的方法，还能针对特定的具体类型，例如:</p>
    <pre><code class="language-rust">impl Point&lt;f32&gt; {
    fn distance_from_origin(&amp;self) -&gt; f32{
        (self.x.powi(2) + self.y.powi(2)).sqrt()
    }
}
</code></pre>
    <p>这段代码意味着 <code>Point&lt;f32&gt;</code>类型会有一个方法 <code>distance_from_origin</code>，而对于其他不是 <code>&lt;f32&gt;</code>类型的的 <code>Point&lt;T&gt;</code>实现则无法使用此方法。
    </p>
    <p><strong>const泛型(Rust 1.51版本引入)</strong></p>
    <p>在之前买的泛型中，可以抽象为一句话，针对类型实现的泛型，所有的泛型都是为了抽象不同的类型，那有没有针对值的泛型?</p>
    <pre><code class="language-rust">fn display_array&lt;T: std::fmt::Debug, const N: usize&gt;(arr: [T;N]){
    println!(&quot;{:?}&quot;,arr);
}
fn main(){
    let arr:[i32;3] = [1,2,3];
    display_array(arr);
    let arr:[i32;2] = [1,2];
    display_array(arr);

}
</code></pre>
    <p>如上所示，我们定义了一个类型为 <code>[T;N]</code>的数组，其中T是基于类型的泛型参数，这个和之前泛型没有区别，而重点在于 <code>N</code>这个泛型参数，它是一个基于值的泛型参数，因此他用来替代的是数组的长度。
    </p>
    <p><code>N</code>就是const泛型，定义的语法是 <code>const N:usize</code>斌促成const泛型N，它基于的值类型是 <code>usize</code>。</p>
    <h4>9.2 特征</h4>
    <p>如果我们想定义个一个文件系统，那么该系统跟底层存储解耦是很重要的，文件操作主要包含三个:<code>open</code>，<code>write</code>，<code>read</code>这些操作可以发生在很多地方，如果你要为每一种情况都单独实现一套代码，那这种实现将过于繁杂，而且也没有那个必要。
    </p>
    <p>Rust中的特征(trait)很类似于接口。</p>
    <p>在之前，我们也遇见过许多特征，例如 <code>#[derive(Debug)]</code>，它在我们定义的类型(struct)上自动派生Debug特征，接着我们就可以使用 <code>println!(&quot;{:?}&quot;,x)</code>打印这个类型。</p>
    <p>再例如之前泛型中，我们实现加法的方法。</p>
    <pre><code class="language-rust">
fn add&lt;T: std::ops::Add&lt;Output = T&gt;&gt;(a:T, b:T) -&gt; T {
    a + b
}
</code></pre>
    <p>通过 <code>std::ops:Add</code>特征来限制 <code>T</code>，只有 <code>T</code>实现了 <code>std::ops::Add</code>才能进行合法的加法操作，毕竟不是所有的类型都可以相加。</p>
    <p>这些都说明了一个道理<strong>特征定义了一个可以被共享的行为，只要实现了特征，你就能使用该行为。</strong></p>
    <p><strong>定义特征</strong></p>
    <p>如果不同的类型具有相同的行为，那么我们就可以定义一个特征，然后为这些类型实现该特征，定义特征是把一些方法组合在一起，目的是定义一个实现某些目标所必须的行为的集合。</p>
    <p>例如，我们现在有Post和Weibo两个结构体，而我们想对响应的内容进行总结，也就是无论是文章内容还是微博内容，都可以在某个时间点进行总结，那么总结这个行为就是共享的，因此可以用特征来定义:</p>
    <pre><code class="language-rust">pub trait Summary {
    fn summarize(&amp;self) -&gt; String;
}
</code></pre>
    <p>这里使用 <code>trait</code>关键字来定义特征，<code>Summary</code>是特征名，在大括号中定义了该特征的所有方法。</p>
    <p>特征只定义行为看起来是什么样的，而不定义具体行为，你可以理解为抽象方法，只定义方法，不提供实现，但是特征中是可以有默认实现的。</p>
    <p>接下来，每一个实现这个特征的类型都需要具体实现该特征的响应方法，编译器也会确保任何实现 <code>Summary</code>特征的类型都拥有与这个签名的定义完全一致的 <code>summarize</code>方法</p>
    <p><strong>实现特征</strong></p>
    <pre><code class="language-rust">pub trait Summary{
    fn summarize(&amp;self) -&gt;String;
}

struct Post {
    title:String,
    author:String,
    content:String,
}
struct Weibo{
    username:String,
    content:String,
}

impl Summary for Post{
    fn summarize(&amp;self) -&gt; String {
        format!(&quot;文章{}，作者{}&quot;,self.title,self.author)
    }
}
impl Summary for Weibo{
    fn summarize(&amp;self) -&gt; String {
        format!(&quot;{}发表了微博{}&quot;, self.username, self.content)
    }
}
</code></pre>
    <p><strong>特征定义与实现的位置</strong></p>
    <p>Rust为了确保其他人编写的代码不会破坏你的代码，也确保你不会莫名其妙就破坏了其他代码。有一条非常重要的规则。</p>
    <blockquote>
        <p><strong>如果你想要为类型A实现特征T，那么A或者T至少有一个是在当前作用域中定义的。</strong></p>
    </blockquote>
    <p>你可以在特征中定义默认的实现，这样其他类型无需在实现该方法，或者也可以选择重载该方法。</p>
    <p><strong>使用特征作为函数参数</strong></p>
    <p>特征除了可以作为类抽象方法来使用外，它还可以作为函数的参数</p>
    <pre><code class="language-rust">pub fn notify(item: &amp;impl Summary){
    println!(&quot;Breaking news! {}&quot;,item.summarize());
}
</code></pre>
    <p>我们传入的参数为 <code>impl Summary</code>类型的参数，顾名思义，他的意思是实现了 <code>Summary</code>特征的 <code>item</code>参数。</p>
    <p>你可以使用任何实现了 <code>Summary</code>特征的类型作为该函数的参数，同时在函数体内，还可以调用该特征的方法，例如 <code>summarize</code>方法，</p>
    <h5>9.2.1 特征约束</h5>
    <p>虽然 <code>impl trait</code>这种语法非常好理解，但是实际上他只是一个语法糖，例如 <code>Summary</code>特征的完整书写如下:</p>
    <pre><code class="language-rust">pub fn notify&lt;T: Summary&gt;(item: &amp;T) {
    println!(&quot;Breaking news {}&quot;,item.summarize());
}
</code></pre>
    <p>形如 <code>T: Summary</code>被称为特征约束</p>
    <p>对于简单场景下的功能，语法糖足够好用，但是根据一些复杂的场景，特征约束可以让我们拥有更大的灵活性。</p>
    <p>例如，我们我们想要在一个函数中传入两个同类型的实现了Summary特征的函数，那么这个语法糖就无法做到这种限制，但是我们使用特征约束却可以实现:</p>
    <pre><code class="language-rust">pub fn notify&lt;T: Summary&gt;(item1: &amp;T, item2: &amp;T){

}
</code></pre>
    <p>这样，编译器就会强制让两个参数为同一个类型。而不用你去手动检查。</p>
    <h5>9.2.2 多重约束</h5>
    <p>除了单个约束，我们还可以指定多个约束条件，例如:</p>
    <pre><code class="language-rust">pub fn notify(item: &amp;(impl Summary + Display)){...}
</code></pre>
    <p>或者</p>
    <pre><code class="language-rust">pub fn notify&lt;T : Summary + Display&gt;(item: &amp;T){...}
</code></pre>
    <h5>9.2.3 where约束</h5>
    <p>此外，对于复杂的特征约束，可以使用where约束的方式来进行简化</p>
    <pre><code class="language-rust">fn some_function&lt;T: Display + Clone, U: Clone + Debug&gt;(t: &amp;T, u: &amp;U) -&gt; i32 {}
</code></pre>
    <pre><code class="language-rust">fn some_function&lt;T&gt;(t: &amp;T, u: &amp;U) -&gt; i32
\t\twhere T: Display + Cone,
\t\t\t  U: Clone + Debug {
}
</code></pre>
    <h5>9.2.4 impl Trait 作为函数返回值</h5>
    <p>同样的，<code>impl Trait</code>不仅可以作为函数的参数，也可以作为函数的返回值。</p>
    <pre><code class="language-rust">fn returns_summarizable() -&gt; impl Summary {
    Weibo{
        username: String::from(&quot;sunface&quot;),
        content: String::from(&quot;...&quot;),
    }
}
</code></pre>
    <p>该函数返回了一个实现了 <code>Summary</code>特征的类型，Rust编译器只会检查你是不是实现了这个特征，而不会去关注你到底是哪个具体的类型。</p>
    <p>但是这种方式也会存在一个问题: 只能返回一个具体的类型，例如:</p>
    <pre><code class="language-rust">
#![allow(unused)]
fn main() {
fn returns_summarizable(switch: bool) -&gt; impl Summary {
    if switch {
        Post {
            title: String::from(
                &quot;Penguins win the Stanley Cup Championship!&quot;,
            ),
            author: String::from(&quot;Iceburgh&quot;),
            content: String::from(
                &quot;The Pittsburgh Penguins once again are the best \\
                 hockey team in the NHL.&quot;,
            ),
        }
    } else {
        Weibo {
            username: String::from(&quot;horse_ebooks&quot;),
            content: String::from(
                &quot;of course, as you probably already know, people&quot;,
            ),
        }
    }
}
}
</code></pre>
    <p>这里我们通过if-else判断返回不同的类型，即使他们都实现了Summary特征，但这段代码还是无法编译，这是由于Rust编译器提示我们返回了两个不同的类型 <code>Post</code>，<code>Weibo</code>，如果需要返回两个不同的类型，需要使用特征对象。
    </p>
    <h5>9.2.5 特征对象</h5>
    <p>对于上面这种无法编译的情况，在不使用特征对象的情况下，你也可以使用枚举来进行实现，而对于特征对象，你可以认为是Rust对于没有继承的一种解决方法。</p>
    <p>例如:</p>
    <pre><code class="language-rust">pub trait Draw {
    fn draw(&amp;self);
}
pub struct Button {
    pub width: u32,
    pub height: u32,
    pub label: String,
}

impl Draw for Button {
    fn draw(&amp;self) {
        // 绘制按钮的代码
    }
}

struct SelectBox {
    width: u32,
    height: u32,
    options: Vec&lt;String&gt;,
}

impl Draw for SelectBox {
    fn draw(&amp;self) {
        // 绘制SelectBox的代码
    }
}
</code></pre>
    <p>对于上面的Draw特征，我们定义了两个结构体实现了Draw特征，现在我们需要一个函数，他传入一个实现了Draw特征的对象，但是我们只有在运行是才能知道他的具体类型是哪个，怎么办?这时我们就可以使用特征对象。</p>
    <p>特征对象指向实现了Draw特征的类型的实例，也就是指向了Button或者SelectBox的实例。</p>
    <p>可以通过 <code>&amp;</code>引用或 <code>Box&lt;T&gt;</code>智能指针的方式来创建特征对象。</p>
    <pre><code class="language-rust">trait Draw {
    fn draw(&amp;self) -&gt; String;
}

impl Draw for u8 {
    fn draw(&amp;self) -&gt; String {
        format!(&quot;u8: {}&quot;, *self)
    }
}

impl Draw for f64 {
    fn draw(&amp;self) -&gt; String {
        format!(&quot;f64: {}&quot;, *self)
    }
}

// 若 T 实现了 Draw 特征， 则调用该函数时传入的 Box&lt;T&gt; 可以被隐式转换成函数参数签名中的 Box&lt;dyn Draw&gt;
fn draw1(x: Box&lt;dyn Draw&gt;) {
    // 由于实现了 Deref 特征，Box 智能指针会自动解引用为它所包裹的值，然后调用该值对应的类型上定义的 \`draw\` 方法
    x.draw();
}

fn draw2(x: &amp;dyn Draw) {
    x.draw();
}

fn main() {
    let x = 1.1f64;
    // do_something(&amp;x);
    let y = 8u8;

    // x 和 y 的类型 T 都实现了 \`Draw\` 特征，因为 Box&lt;T&gt; 可以在函数调用时隐式地被转换为特征对象 Box&lt;dyn Draw&gt;
    // 基于 x 的值创建一个 Box&lt;f64&gt; 类型的智能指针，指针指向的数据被放置在了堆上
    draw1(Box::new(x));
    // 基于 y 的值创建一个 Box&lt;u8&gt; 类型的智能指针
    draw1(Box::new(y));
    draw2(&amp;x);
    draw2(&amp;y);
}

</code></pre>
    <ul>
        <li><code>draw1</code>函数的参数是 <code>Box&lt;dyn Draw&gt;</code>形式的特征对象，该特征是通过 <code>Box::new(x)</code>的方式创建的。</li>
        <li><code>draw2</code>函数的参数是 <code>&amp;dyn Draw</code>形式的特征对象，该特征对象是通过 <code>&amp;x</code>的方式创建的。</li>
    </ul>
    <p><strong>特征对象的限制</strong></p>
    <p>不是所有的特征都能拥有特征对象，只有对象安全的特征才行，当一个特征的所有方法都有如下属性时，他的对象才是安全的:</p>
    <ul>
        <li>方法的返回类型不能是Self</li>
        <li>方法没有任何泛型参数</li>
    </ul>
    <p><strong>关联类型</strong></p>
    <p>关联类型和关联函数没有任何关系，它是在定义特征时定义的一个类型，例如，标准库中迭代器的特征 <code>Iterator</code>:</p>
    <pre><code class="language-rust">pub trait Iterator{
    type Item;
    fn next(&amp;mut self) -&gt; Option&lt;Self::Item&gt;{
        ...
    }
}
</code></pre>
    <p>迭代器有一个Item类型，用于替代遍历的值类型。同时next方法也返回了一个item类型，不过使用Option枚举进行了包裹，加入迭代器中的值是i32类型，那么next方法的返回值就是 <code>Option&lt;i32&gt;</code>类型的，例如:
    </p>
    <pre><code class="language-rust">impl Iterator for Counter{
    type Item = u32;
    fn next(&amp;mut self) -&gt; Option&lt;Self::Item&gt; {

    }
}
fn main(){
    let c = Counter{..};
    c.next;
}
</code></pre>
    <p><strong>默认泛型类型参数</strong></p>
    <p>当使用泛型类型参数时，可以为其指定一个默认的具体类型，例如标准库中的 <code>std::op::Add</code>特征:</p>
    <pre><code class="language-rust">trait Add&lt;RHS=Self&gt; {
\ttype Output;
    fn add(self, rhs: RHS) -&gt; Self::Output;
}
</code></pre>
    <p>他有一个泛型参数 <code>rhs</code>，但是与我们之前的使用方法不同，这里他给 <code>RHS</code>一个默认值，也就是当用户不指定 <code>RHS</code>时，默认使用两个同样类型的值进行相加，然后返回一个关联类型
        <code>Output</code>。</p>
    <pre><code class="language-rust">use std::ops::Add;

struct Millimeters(u32);
struct Meters(u32);

impl Add&lt;Meters&gt; for Millimeters {
    type Output = Millimeters;

    fn add(self, other: Meters) -&gt; Millimeters {
        Millimeters(self.0 + (other.0 * 1000))
    }
}


</code></pre>
    <p>例如这里就使用了两个不同的类型进行相加操作。</p>
    <p>默认类型参数主要用于两个方面:</p>
    <ul>
        <li>减少实现的样板代码</li>
        <li>扩展类型但是无需大幅修改现有的代码</li>
    </ul>
    <p><strong>调用同名的方法</strong></p>
    <p>在编写程序的过程中，难免会遇到多个特征具有同名的方法，甚至实现特征的结构体也拥有这个方法，那么我们在使用这个方法的时候，到底调用的是谁的方法。</p>
    <pre><code class="language-rust">trait Pilot{
    fn fly(&amp;self);
}
trait Wizard{
    fn fly(&amp;self);
}

struct Human;

impl Human{
    fn fly(&amp;self){
        println!(&quot;this is Human&quot;);
    }
}

impl Pilot for Human {
    fn fly(&amp;self) {
        println!(&quot;this is Pilot&quot;);
    }
}

impl Wizard for Human {
    fn fly(&amp;self) {
        println!(&quot;this is Wizard&quot;);
    }
}

</code></pre>
    <p>当你调用Human实例的fly方法时，编译器默认调用该实例中的方法。</p>
    <pre><code class="language-rust">fn main() {
    let human = Human;
    human.fly();// this is Human
    // 如果需要调用特征上的方法，需要使用显式调用
    Pilot::fly(&amp;human); // this is Pilot
    Wizard::fly(&amp;human); // this is Wizard
}
</code></pre>
    <p>主要的方式就是通过传入self参数，告诉编译器我主要调用的是哪个实现类的fly方法。</p>
    <p>但这时，就会引入另一个问题，当没有self参数时，编译器如何知道到底是哪个类型调用了方法?</p>
    <p>例如:</p>
    <pre><code class="language-rust">trait Animal{
    fn baby_name() -&gt; String;
}
struct Dog;

impl Animal for Dog{
    fn baby_name() -&gt; String {
        String::from(&quot;Dog!&quot;)
    }
}

struct Cat;
impl Animal for Cat{
    fn baby_name() -&gt; String {
        String::from(&quot;Cat!&quot;)
    }
}
</code></pre>
    <p>这时，使用上面的方式直接使用特征来调用是不行的，rust编译器不知道它到底是Dog还是Cat。</p>
    <p>此时，我们就需要使用<strong>完全限定语法</strong>。</p>
    <pre><code class="language-rust">println!(&quot;the baby name is {}&quot;,&lt;Dog as Animal&gt;::baby_name());
println!(&quot;the baby name is {}&quot;,&lt;Cat as Animal&gt;::baby_name());
</code></pre>
    <p>通过 <code>as</code>关键字我们向Rust编译器提供了类型注解，告诉了Rust编译器，我们需要调用的到底是哪个类型实现的方法。</p>
    <p><strong>完全限定语法为:</strong></p>
    <pre><code class="language-rust">&lt;Type as Trait&gt;::function(receiver_if_method, next_arg, ...);
</code></pre>
    <p><strong>特征定义中的特征约束</strong></p>
    <p>有时，当我们需要定义特征，但哪个特征又必须先实现另一个特征时，这时就是一个特征定义的特征约束，称为 <code>supertrait</code>，例如:</p>
    <pre><code class="language-rust">use std::fmt::Display;
trait Outline_print : Display{
    fn outline_print(&amp;self){
         let output = self.to_string();
        let len = output.len();
        println!(&quot;{}&quot;, &quot;*&quot;.repeat(len + 4));
        println!(&quot;*{}*&quot;, &quot; &quot;.repeat(len + 2));
        println!(&quot;* {} *&quot;, output);
        println!(&quot;*{}*&quot;, &quot; &quot;.repeat(len + 2));
        println!(&quot;{}&quot;, &quot;*&quot;.repeat(len + 4));
    }
}
</code></pre>
    <p>当我们去实现 <code>Outline_print</code>约束时，编译器会首先检查，你有没有实现Display特征，因为在Outline_print特征中，我们使用了 <code>to_string</code>方法，如果没有实现Display特征的话，你就无法使用这个方法。
    </p>
    <pre><code class="language-rust">use::fmt;
struct Point{
    x:i32,
    y:i32,
}
impl fmt::Display for Point{
    fn fmt(&amp;self, f: &amp;mut fmt::Formatter)-&gt; fmt::Result{
        write!(f,&quot;({},{})&quot;,self.x,self.y)
    }
}
impl Outline_print for Point{

}
</code></pre>
    <p><strong>为外部类型实现外部特征</strong></p>
    <p>我们知道，Rust有一个&quot;孤儿规则&quot;，就是特征和类型必须有一个是在本地的，才能实现特征。</p>
    <p>现在，我们有了另一个方法: <code>new type</code>。</p>
    <p>例如，我们现在要为标准库的 <code>Vec&lt;T&gt;</code>类型实现 <code>Display</code>特征，由于他们都是外部的，所以我们需要使用new type。</p>
    <pre><code class="language-rust">use std::fmt:Display;
struct Wrapper(Vec&lt;String&gt;);

impl Display for Wrapper{
    fn fmt(&amp;self,f: &amp;mut fmt::Formatter&lt;\`_&gt;)-&gt;fmt::Result{
        wirte!(f,&quot;[{}]&quot;,self.0.join(&quot;,&quot;));
    }
}
</code></pre>
    <p>在使用new type时，如果我们需要取出数据，需要使用 <code>self.0</code>，然后使用vec的方法进行调用。</p>
    <h3>十、类型转换</h3>
    <p>Rust是类型安全的语言，因此在Rust中做类型安全转换不是一件简单的事。</p>
    <h4>10.1 as转换</h4>
    <pre><code class="language-rust">fn main(){
    let a: i32 = 10;
    let b: u16 = 100;
    if a &lt; b{
        println!(&quot;...&quot;);
    }
}
</code></pre>
    <p>对于上面这段代码，我们一眼就能看出，a和b的类型不一致，所以这段代码注定无法通过编译，这时我们就需要通过类型转换，将b转换为a的类型来进行比较</p>
    <pre><code class="language-rust">fn main(){
    let a: i32 = 10;
    let b: u16 = 100;
    if a &lt; (b as i32) {
        println!(&quot;...&quot;);
    }
}
</code></pre>
    <p>下面是一些常用的转换形式:</p>
    <pre><code class="language-rust">fn main() {
   let a = 3.1 as i8;
   let b = 100_i8 as i32;
   let c = 'a' as u8; // 将字符'a'转换为整数，97

   println!(&quot;{},{},{}&quot;,a,b,c)
}
</code></pre>
    <p><strong>内存地址转换为指针(需要使用unsafe)</strong></p>
    <pre><code class="language-rust"> \tlet mut values: [i32; 2] = [1, 2];
    // 获取values的可变指针，该指针指向values第一个元素
    let p1: *mut i32 = values.as_mut_ptr();
    // 将p1指针转换为整数
    let first_address = p1 as usize;
    println!(&quot;first_address:{}&quot;, first_address);
    // i32类型占用4个字节
    let second_address = first_address + std::mem::size_of::&lt;i32&gt;();
    println!(&quot;i8: {}&quot;, std::mem::size_of::&lt;i8&gt;()); // 1
    println!(&quot;i32: {}&quot;,std::mem::size_of::&lt;i32&gt;()); // 4
    println!(&quot;usize: {}&quot;, std::mem::size_of::&lt;usize&gt;()); // 8
    // 再次将整数类转换为指针，此时指针指向数组第二个元素
    let p2 = second_address as *mut i32;
\t//
    unsafe {
        *p2 += 1;
    };
    assert_eq!(values[1], 3);
</code></pre>
    <h4>10.2 TryInto转换</h4>
    <pre><code class="language-rust">let a: i32 = 10;
    let b: u8 = 12;
    // 通过特征TryInto转换，转换失败程序直接退出，不建议这样写
    //let b: i32 = b.try_into().unwrap();
    // 通过try_into的返回值为Ok还是Err来判断是否转换成功，并执行相应的操作
    let b:i32 =match b.try_into(){
        Ok(num) =&gt; {
            num
        },
        Err(e) =&gt; {
            println!(&quot;{:?}&quot;,e);
            0
        }
    };
    if a &lt; b {
        println!(&quot;a is lower than b&quot;);
    };
</code></pre>
    <p><strong>变形记(Transmutes)</strong></p>
    <p><code>mem::transmute&lt;T, U&gt;</code> 将类型 <code>T</code> 直接转成类型 <code>U</code>，唯一的要求就是，这两个类型占用同样大小的字节数！但是这种转换会导致非常多的问题:</p>
    <ul>
        <li>转换后创建一个任意类型的实例会造成无法想象的混乱，而且根本无法预测。不要把 <code>3</code> 转换成 <code>bool</code> 类型，就算你根本不会去使用该 <code>bool</code> 类型，也不要去这样转换</li>
        <li>变形后会有一个重载的返回类型，即使你没有指定返回类型，为了满足类型推导的需求，依然会产生千奇百怪的类型</li>
        <li>将 <code>&amp;</code> 变形为 <code>&amp;mut</code> 是未定义的行为</li>
        <li>变形为一个未指定生命周期的引用会导致<a href="https://course.rs/advance/lifetime/advance.html">无界生命周期</a></li>
        <li>在复合类型之间互相变换时，你需要保证它们的排列布局是一模一样的！一旦不一样，那么字段就会得到不可预期的值，这也是未定义的行为，至于你会不会因此愤怒， <strong>WHO CARES</strong> ，你都用了变形了，老兄！
        </li>
    </ul>
    <p><strong>String和i32之间的转换</strong></p>
    <p>使用 <code>parse</code> 方法可以将一个 <code>String</code> 转换成 <code>i32</code> 数字，这是因为在标准库中为 <code>i32</code> 类型实现了 <code>FromStr</code>: : <code>impl FromStr for
        i32</code></p>
    <pre><code class="language-rust">// 为了使用 \`from_str\` 方法, 你需要引入该特征到当前作用域中
use std::str::FromStr;
fn main() {
    let parsed: i32 = &quot;5&quot;.parse().unwrap();
    let turbo_parsed:i32 = &quot;10&quot;.parse().unwrap();
    let from_str = i32::from_str(&quot;20&quot;).unwrap();
    let sum = parsed + turbo_parsed + from_str;
    assert_eq!(sum, 35);
    println!(&quot;Success!&quot;)
}
</code></pre>
    <h3>十一、返回值和错误处理</h3>
    <h4>11.1 panic! 与不可恢复错误</h4>
    <p><strong>调用panic!</strong></p>
    <p>Rust提供了一个 <code>panic!</code>宏，你在程序和任何地方都可以这样调用:</p>
    <pre><code class="language-rust">fn main(){
    panic!(&quot;crash and burn&quot;);
}
</code></pre>
    <p><strong>panic时的两种终止方式</strong></p>
    <p>当出现 <code>panic!</code>时，程序提供了两种方式来处理终止流程:<code>栈展开</code>和 <code>直接终止</code>。</p>
    <p>其中，默认的方式就是栈展开，这意味着Rust会回溯栈上数据和函数调用，因此也意味着更多的善后工作，好处是可以给出充分的报错信息和栈调用信息。</p>
    <p>而当你需要直接终止程序不做任何处理时，你需要去修改 <code>Cargo.toml</code>文件:</p>
    <pre><code class="language-rust">[profile.release]
panic = 'abort'
</code></pre>
    <p>如果是 <code>main</code> 线程，则程序会终止，如果是其它子线程，该线程会终止，但是不会影响 <code>main</code> 线程。因此，尽量不要在 <code>main</code> 线程中做太多任务，将这些任务交由子线程去做，就算子线程
        <code>panic</code> 也不会导致整个程序的结束。</p>
    <h4>11.2 可恢复的错误Result</h4>
    <p>由于panic会导致程序直接崩溃而无法运行，但有时我们需要在程序发生错误时继续运行，这时就需要错误处理，所以Rust提供了一种更温和的错误处理方式:<code>Result&lt;T,E&gt;</code>。</p>
    <pre><code class="language-rust">enum Result&lt;T, E&gt; {
    Ok(T),
    Err(E),
}
</code></pre>
    <p>利用Result处理错误信息</p>
    <pre><code class="language-rust">  let f = match File::open(&quot;hello.txt&quot;){
        Ok(f) =&gt; {
            println!(&quot;the file is Open&quot;);
            f
        },
        Err(e) =&gt; match e.kind() {
            ErrorKind::NotFound =&gt; match File::create(&quot;hello.txt&quot;){
                Ok(file) =&gt; {
                    println!(&quot;the file is not exists,now is creating the file&quot;);
                    file
                },
                Err(err) =&gt; panic!(&quot;can't create the file&quot;)
            },
            other_kind =&gt; panic!(&quot;can't open the file&quot;)
        }
    };
</code></pre>
    <p>上面的代码中，我们向打开一个名为 <code>hello.txt</code>的文件，如果打开成功则直接返回，如果打开失败则返回错误信息，如果错误信息为找不到指定文件，或文件不存在，则新建此文件并返回，如果是其他错误则直接终止。
    </p>
    <h4>11.3 发生错误直接崩溃</h4>
    <p>在不需要错误处理的场景，例如写原型，实例时我们不想使用 <code>match</code>去一一匹配分支，那么有没有办法简化这个过程?有，那就是 <code>unwrap</code>和 <code>expect</code>。</p>
    <p>他们的区别是: unwrap是直接panic，返回编译器提供的错误信息，而expect可以带上自定义的错误提示信息，相当于重载了错误打印的函数。</p>
    <h4>11.4 异常抛出</h4>
    <p>
        在我们编写程序的过程中，难免需要碰到一个函数中嵌套了多层函数，而错误处理也往往不是哪里出错就在哪里处理，实际应用中应当将错误层层上传交给调用链的上层进行处理错误，下面就是一个将错误层层上传的例子:</p>
    <pre><code class="language-rust">fn read_username_from_file(file_name:&amp;str) -&gt;Result&lt;String,io::Error&gt;{
    let f = File::open(file_name);
    let mut f = match f {
        Ok(file) =&gt; file,
        Err(err) =&gt; return Err(err)
    };
    let mut s= String::new();
    match f.read_to_string(&amp;mut s){
        Ok(_) =&gt; Ok(s),
        Err(err) =&gt; Err(err)
    }
}
</code></pre>
    <p>该函数的作用是从指定文件中读取所有字符，期间遇到错误如打开文件失败，找不到指定文件等错误，不处理错误，而是将错误返回(向上传播)，传给调用者去处理。</p>
    <h4>11.5 更简单的异常处理宏 ?(没错就是?号)</h4>
    <p>使用?宏我们可以更加便捷的去处理错误</p>
    <pre><code class="language-rust">use std::fs::File;
use std::io;
use std::io::Read;

fn read_username_from_file() -&gt; Result&lt;String, io::Error&gt; {
    let mut f = File::open(&quot;hello.txt&quot;)?;
    let mut s = String::new();
    f.read_to_string(&amp;mut s)?;
    Ok(s)
}
</code></pre>
    <p>对于之前的一大段代码，使用<code>?</code>可以简化为这样。</p>
    <p>这其实就是一个语法糖，<code>?</code>的处理逻辑与<code>match</code>是相同的，不过省略了许多代码</p>
    <p>它做了如下工作:</p>
    <pre><code class="language-rust">let mut f = match File::open(&quot;hello.txt&quot;){
    Ok(f) =&gt; f,
    Err(err) =&gt; Err(err)
};
</code></pre>
    <p>相当于rust帮你把错误向上抛出了，不需要你手动去写代码，你只需要关注返回成功的处理逻辑。</p>
    <p>但是同样使用<code>?</code>和<code>match</code>，<code>?</code>的功能更胜一筹</p>
    <p>因为<code>?</code>可以进行自动的类型转换，例如:</p>
    <pre><code class="language-rust">fn open_file() -&gt; Result&lt;File, Box&lt;dyn std::error::Error&gt;&gt; {
    let mut f = File::open(&quot;hello.txt&quot;)?;
    Ok(f)
}
</code></pre>
    <p>File::open的返回错误类型为 <code>std::io::Error</code>，但是我们却返回了 <code>std::error::Error</code>，这是因为后者是一个最原始的通用的错误类型，而前者实现了后者，?可以帮助我们自动进行类型转换。
    </p>
    <p>根本原因是在于标准库中定义的 <code>From</code>特征，该特征有一个方法 <code>From</code>，用于把一个类型转换为另一个类型，<code>?</code>可以自动调用该方法，然后进行隐式的类型转换。</p>
    <p><strong><code>?</code>还可以用于Option</strong></p>
    <p>例如:</p>
    <pre><code class="language-rust">fn first(arr:&amp;[i32]) -&gt; Option&lt;&amp;i32&gt;{
   let first = arr.get(0)?;
    Some(first);
}
</code></pre>
    <p>其实上面的代码有点多此一举，但是这里<code>?</code>的作用是，如果 <code>arr.get(0)</code>返回None的话，那么程序将直接返回，不进行下面的操作。</p>
    <h3>十二、代码和文档注释</h3>
    <p>在Rust中注释被分为三类:</p>
    <ul>
        <li>代码注释</li>
        <li>文档注释</li>
        <li>包和模块注释</li>
    </ul>
    <p>其中代码注释与其他语言相同，而文档注释就不一样了，他不仅包含了注释的功能，还有其他功能。</p>
    <h4>12.1 文档注释</h4>
    <p>当查看一个 <code>crate.io</code>上的包时，往往需要通过它提供的文档来浏览相关的功能特性，使用方法等，这种文档就是通过文档注释实现的。</p>
    <p>Rust提供了 <code>cargo doc</code>的命令，可以用于把这些文档注释转换为HTML格式的网页文件，最终展示给用户浏览</p>
    <p><strong>文档行注释///</strong></p>
    <p>文档注释就是通过三个斜杠表示 <code>///</code></p>
    <pre><code class="language-rust">/// \`add_one\` 将指定值加1
///
/// # Examples
///
/// \`\`\`
/// let arg = 5;
/// let answer = my_crate::add_one(arg);
///
/// assert_eq!(6, answer);
/// \`\`\`
pub fn add_one(x: i32) -&gt; i32 {
    x + 1
}
</code></pre>
    <p>以上代码需要注意:</p>
    <ul>
        <li>文档注释需要位于lib类型的包中，例如 <code>src/lib.rs</code>中</li>
        <li>文档注释可以使用 <code>markdown</code>语法</li>
        <li>被注释的对象需要使用 <code>pub</code>对外可见，记住:文档注释是给用户看的，内部实现细节不应该被暴露出去。</li>
    </ul>
    <p><strong>查看文档cargo doc</strong></p>
    <p>写完文档注释后，可以通过 <code>cargo doc</code>命令生成 <code>HTML</code>文件，放入 <code>target/doc</code>目录下。</p>
    <p>当然，为了方便，我们使用 <code>cargo doc --open</code>命令，可以在生成文档后，自动在浏览器打开网页。</p>
    <p><strong>文档测试</strong></p>
    <p>文档注释的一个最大的作用就是，它是可以运行的，所以你可以通过写文档注释来写测试用例，不需要去使用main函数就可以运行，通过使用 <code>cargo test</code>运行测试</p>
    <p>需要注意的是，你可能需要使用类如 <code>world_hello::compute::add_one(arg)</code>的完整路径来调用函数，因为测试是在另外一个独立的线程中运行的。</p>
    <p><strong>造成panic的文档测试</strong></p>
    <p>下面的文档测试运行中会造成 <code>panic</code></p>
    <pre><code class="language-rust">/// # Panics
///
/// The function panics if the second argument is zero.
///
/// \`\`\`rust
/// // panics on division by zero
/// world_hello::compute::div(10, 0);
/// \`\`\`
pub fn div(a: i32, b: i32) -&gt; i32 {
    if b == 0 {
        panic!(&quot;Divide-by-zero error&quot;);
    }
    a / b
}
</code></pre>
    <p>想要通过这种测试，可以添加 <code>should_panic</code></p>
    <pre><code class="language-rust">/// # Panics
///
/// The function panics if the second argument is zero.
///
/// \`\`\`rust,should_panic
/// // panics on division by zero
/// world_hello::compute::div(10, 0);
/// \`
</code></pre>
    <p><strong>保留测试，隐藏文档</strong></p>
    <p>有时，我们希望保留文档测试的功能，但是又要将某些测试用例的内容从文档中隐藏起来:</p>
    <pre><code class="language-rust">/// \`\`\`
/// # // 使用#开头的行会在文档中被隐藏起来，但是依然会在文档测试中运行
/// # fn try_main() -&gt; Result&lt;(), String&gt; {
/// let res = world_hello::compute::try_div(10, 0)?;
/// # Ok(()) // returning from try_main
/// # }
/// # fn main() {
/// #    try_main().unwrap();
/// #
/// # }
/// \`\`\`
pub fn try_div(a: i32, b: i32) -&gt; Result&lt;i32, String&gt; {
    if b == 0 {
        Err(String::from(&quot;Divide-by-zero&quot;))
    } else {
        Ok(a / b)
    }
}
</code></pre>
    <p>以上文档注释中，我们使用 <code>#</code> 将不想让用户看到的内容隐藏起来，但是又不影响测试用例的运行，最终用户将只能看到那行没有隐藏的</p>
    <p><code>let res = world_hello::compute::try_div(10, 0)?;</code></p>
    <p><strong>文档搜索别名</strong></p>
    <p>Rust文档提供搜索功能，我们可以为自己的类型定义几个别名，以实现更好的搜索展现，当别名命中时，搜索结果会被放在第一位:</p>
    <pre><code class="language-rust">#[doc(alias = &quot;x&quot;)]
#[doc(alias = &quot;big&quot;)]
pub struct BigX;

#[doc(alias(&quot;y&quot;, &quot;big&quot;))]
pub struct BigY;
</code></pre>
    <p><strong>文档属性</strong></p>
    <p><strong>inline</strong></p>
    <p>可以用于内联文档，而不是链接到一个单独的页面</p>
    <pre><code class="language-rust">#[doc(inline)]
pub use bar::Bar;

/// bar docs
mod bar {
    /// the docs for Bar
    pub struct Bar;
}
</code></pre>
    <p><strong>no_inline</strong></p>
    <p>用于防止链接到单独的页面或其他方法</p>
    <pre><code class="language-rust">// Example from libcore/prelude
#[doc(no_inline)]
pub use crate::mem::drop;
</code></pre>
    <p><strong>hidden</strong></p>
    <p>通过这个属性让 <code>rustdoc</code>不要将下面的项包含在文档中:</p>
    <pre><code class="language-rust">// Example from the futures-rs library
#[doc(hidden)]
pub use self::async_await::*;
</code></pre>
    <h3>十三、格式化输出</h3>
    <p>下面是一些格式化输出的例子</p>
    <pre><code class="language-rust">println!(&quot;Hello&quot;);                 // =&gt; &quot;Hello&quot;
println!(&quot;Hello, {}!&quot;, &quot;world&quot;);   // =&gt; &quot;Hello, world!&quot;
println!(&quot;The number is {}&quot;, 1);   // =&gt; &quot;The number is 1&quot;
println!(&quot;{:?}&quot;, (3, 4));          // =&gt; &quot;(3, 4)&quot;
println!(&quot;{value}&quot;, value=4);      // =&gt; &quot;4&quot;
println!(&quot;{} {}&quot;, 1, 2);           // =&gt; &quot;1 2&quot;
println!(&quot;{:04}&quot;, 42);             // =&gt; &quot;0042&quot; with leading zeros
</code></pre>
    <h4>13.1 print!，println!，format!</h4>
    <p>他们三个的区别如下:</p>
    <ul>
        <li><code>print!</code>将格式化文本输出到标准输出，不带换行符</li>
        <li><code>println!</code>同上，但是在行的末尾添加换行符</li>
        <li><code>format!</code>将格式化的文本输出到 <code>String</code>字符串</li>
    </ul>
    <p>除了上面三个，还有两个也可以用于输出</p>
    <p><strong>eprint!，eprintln!</strong></p>
    <p>他们的使用方式和上面的差不多，但是他们输出到标准错误输出:</p>
    <pre><code class="language-rust">eprintln!(&quot;Error: Could not complete task&quot;)
</code></pre>
    <p>他们应当仅被用于输出错误信息和进度信息，其他场景都应该使用 <code>print!</code>系列。</p>
    <h4>13.2 {}与</h4>
    <p>他们两个都是rust中格式化的占位符</p>
    <ul>
        <li><code>{}</code>适用于实现了 <code>std::fmt::Display</code>特征的类型，用来以更优雅，更友好方式格式化文本，例如，展示给用户。</li>
        <li><code>{:?}</code>适用于实现了 <code>std::fmt::Debug</code>特征的类型，用于调试场景</li>
    </ul>
    <p>对于数组、字符串、数值，可以直接使用 <code>{:?}</code>进行输出，但是对于结构体，需要派生 <code>Debug</code>特征后，才能进行输出。</p>
    <p>还有一个是 <code>{:#?}</code>，他和 <code>{:?}</code>几乎一样区别是 <code>{:#?}</code>会进行换行操作。</p>
    <h4>13.3 格式化输出参数</h4>
    <p><strong>位置参数</strong></p>
    <p>除了按照顺序使用值去替换占位符之外，还能让指定位置的参数区替换某个占位符，例如{1}，表示用第二个参数替换该占位符(索引从0开始)，例如:</p>
    <pre><code class="language-rust">println!(&quot;{1},{},{0},{}&quot;,1,2); // 2112
</code></pre>
    <p>上面的打印会输出 <code>2112</code>，而不是 <code>1102</code>，原因是Rust对于 <code>{}</code>中的数字解析为了索引。</p>
    <p><strong>具名参数</strong></p>
    <p>除了像上面哪样指定位置外，我们还可以为参数指定名称:</p>
    <pre><code class="language-rust">fn main(){
    println!(&quot;{arg}&quot;,arg = &quot;test&quot;); // test
    println!(&quot;{name} {}&quot;,name = 1, 2); // 1 2
    println!(&quot;{a}{c}{b}&quot;, a = &quot;a&quot;, b = &quot;b&quot;, c =&quot;c&quot;); // abc;
}
</code></pre>
    <p>主要注意的是: <strong>带名称的参数必须放在不带名称参数的后面</strong>。</p>
    <p>例如下面这段代码会无法通过编译:</p>
    <pre><code class="language-rust">println!(&quot;{a},{1}&quot;,a = &quot;abc&quot;, 2); // err
</code></pre>
    <p>你必须写成这样:</p>
    <pre><code class="language-rust">println!(&quot;{a},{0}&quot;,2,a = &quot;abc&quot;); // abc,2
</code></pre>
    <h4>13.4 格式化参数</h4>
    <p>格式化输出，意味着输出格式会有更多的要求，例如值输出浮点数的小数点的后两位。</p>
    <p>需要注意的是: 只有当你给定的字符小于你指定的宽度时，才会补充空格或者0</p>
    <pre><code class="language-rust">let v = &quot;3.1415926&quot;;
println!(&quot;{:.2}&quot;,v); // 3.14
println!(&quot;{:.4?}&quot;,v); // 3.1416 注意会四首五入
</code></pre>
    <p><strong>字符串填充</strong></p>
    <p>字符串格式化默认使用空格进行填充，并且进行左对齐</p>
    <pre><code class="language-rust">fn main(){
    //-----------------------------------
    // 以下全部输出 &quot;Hello x    !&quot;
    // 为&quot;x&quot;后面填充空格，补齐宽度5
    println!(&quot;Hello {:5}!&quot;, &quot;x&quot;);
    // 使用参数5来指定宽度
    println!(&quot;Hello {:1$}!&quot;, &quot;x&quot;, 5);
    // 使用x作为占位符输出内容，同时使用5作为宽度
    println!(&quot;Hello {1:0$}!&quot;, 5, &quot;x&quot;);
    println!(&quot;[{1:0$}]&quot;,3,2); //输出:[ 2]
    println!(&quot;[{1:0$}]&quot;,2,3); //输出:[3]
    // 使用有名称的参数作为宽度
    println!(&quot;[Hello {:width$}!]&quot;, &quot;x&quot;, width = 5);
    // [Hello x    !]
    //-----------------------------------

    // 使用参数5为参数x指定宽度，同时在结尾输出参数5 =&gt; Hello x    !5
    println!(&quot;Hello {:1$}!{}&quot;, &quot;x&quot;, 5);
}
</code></pre>
    <p><strong>数字填充:符号和0</strong></p>
    <p>数字格式化默认也是使用空格进行填充，但与字符串左对齐不同的是，数字是右对齐，他会在数字的前方补零，这样的好处是不会使你的数字的大小变化。</p>
    <pre><code class="language-rust">fn main() {
    // 宽度是5 =&gt; Hello     5!
    println!(&quot;Hello {:5}!&quot;, 5);
    // 显式的输出正号 =&gt; Hello +5!
    println!(&quot;Hello {:+}!&quot;, 5);
    // 宽度5，使用0进行填充 =&gt; Hello 00005!
    println!(&quot;Hello {:05}!&quot;, 5);
    // 负号也要占用一位宽度 =&gt; Hello -0005!
    println!(&quot;Hello {:05}!&quot;, -5);
}
</code></pre>
    <p><strong>对齐</strong></p>
    <p>实际上，Rust也提供了通过参数进行控制补充空格或者0的对齐方式</p>
    <pre><code class="language-rust">    // 右对齐
    println!(&quot;[{:&lt;5}]&quot;,&quot;x&quot;); // [x    ]
    // 左对齐
    println!(&quot;[{:&gt;5}]&quot;,&quot;x&quot;); // [    x]
    // 居中对齐
    println!(&quot;[{:^5}]&quot;,&quot;x&quot;); // [  x  ]
    // 使用指定的字符进行填充
    // 指定符号填充的前提条件时必须有对齐字符
    println!(&quot;[{:*&lt;5}]&quot;,&quot;x&quot;); // [x****]
</code></pre>
    <p>可以认为<code>小于号&lt;</code>是你给定的字符显示在<code>左边</code>，<code>大于号&gt;</code>是字符显示在<code>右边</code>。</p>
    <p><strong>精度</strong></p>
    <p>精度格式化可以控制浮点数的精度显示的长度</p>
    <pre><code class="language-rust">fn main() {
    let v = 3.1415926;
    // 保留小数点后两位 =&gt; 3.14
    println!(&quot;{:.2}&quot;, v);
    // 带符号保留小数点后两位 =&gt; +3.14
    println!(&quot;{:+.2}&quot;, v);
    // 不带小数 =&gt; 3
    println!(&quot;{:.0}&quot;, v);
    // 通过参数来设定精度 =&gt; 3.1416，相当于{:.4}
    println!(&quot;{:.1$}&quot;, v, 4);

    let s = &quot;hi我是Sunface孙飞&quot;;
    // 保留字符串前三个字符 =&gt; hi我
    println!(&quot;{:.3}&quot;, s);
    // {:.*}接收两个参数，第一个是精度，第二个是被格式化的值 =&gt; Hello abc!
    println!(&quot;Hello {:.*}!&quot;, 3, &quot;abcdefg&quot;);
}
</code></pre>
    <p><strong>进制输出</strong></p>
    <p>可以使用<code>#</code>来控制数字的进制输出:</p>
    <p>注意: 区分大小写!</p>
    <pre><code class="language-rust">fn main() {
    // 二进制 =&gt; 0b11011!
    println!(&quot;{:#b}!&quot;, 27);
    // 八进制 =&gt; 0o33!
    println!(&quot;{:#o}!&quot;, 27);
    // 十进制 =&gt; 27!
    println!(&quot;{}!&quot;, 27);
    // 小写十六进制 =&gt; 0x1b!
    println!(&quot;{:#x}!&quot;, 27);
    // 大写十六进制 =&gt; 0x1B!
    println!(&quot;{:#X}!&quot;, 27);

    // 不带前缀的十六进制 =&gt; 1b!
    println!(&quot;{:x}!&quot;, 27);

    // 使用0填充二进制，宽度为10 =&gt; 0b00011011!
    println!(&quot;{:#010b}!&quot;, 27);
}
</code></pre>
    <p><strong>指数</strong></p>
    <pre><code class="language-rust">fn main(){
    println!(&quot;{:2e}&quot;,1000000000); // 1e9
    println!(&quot;{:2E}&quot;,1000000000); // 1E9
}
</code></pre>
    <p><strong>指针地址</strong></p>
    <pre><code class="language-rust">fn main(){
    let v = vec![1,2,3];
    println!(&quot;{:p}&quot;,v.as_ptr()); // 0x244a832e7c0
}
</code></pre>
    <p><strong>转义字符</strong></p>
    <pre><code class="language-rust">fn main() {
    // &quot;{{&quot; 转义为 '{'   &quot;}}&quot; 转义为 '}'   &quot;\\&quot;&quot; 转义为 '&quot;'
    // =&gt; Hello &quot;{World}&quot;
    println!(&quot; Hello \\&quot;{{World}}\\&quot; &quot;);

    // 下面代码会报错，因为占位符{}只有一个右括号}，左括号被转义成字符串的内容
    // println!(&quot; {{ Hello } &quot;);
    // 也不可使用 '\\' 来转义 &quot;{}&quot;
    // println!(&quot; \\{ Hello \\} &quot;)
}
</code></pre>
    <p><strong>使用函数的返回值进行输出</strong></p>
    <pre><code class="language-rust">fn get_person() -&gt; String{
    String::from(&quot;Ryu2u&quot;)
}
fn main(){
    let name = get_person();
\tprintln!(&quot;{name}&quot;);
}
</code></pre>
    <p>甚至你还可以将环境中的值用于格式化参数</p>
    <pre><code class="language-rust">fn get_format()-&gt; (usize,usize){
    (5,20)
}
fn main(){
     let (width,index) = get_format();
     println!(&quot;[{index:0width$}]&quot;); // [00020]
}
</code></pre>
    <h3>十四、生命周期</h3>
    <p>Rust的声明周期，简而言之就是引用的有效作用域。在大多数时候。我们无需手动的声明生命周期，因为编译器可以自动进行推导，用类型来类比下:</p>
    <ul>
        <li>就像编译器大部分时候可以自动推到类型一样，编译器大多数时候也可以自动推导生命周期</li>
        <li>在多种类型存在时，编译器往往要求我们手动标明类型，当多个生命周期存在，且编译器无法推导出某个引用的生命周期时，就需要我们手动标明生命周期</li>
    </ul>
    <h4>14.1 悬垂指针和生命周期</h4>
    <p>生命周期的主要作用是避免悬垂引用，他会导致程序引用了本不该引用的数据:</p>
    <pre><code class="language-rust">{
    let r;
    {
        let x = 5;
        r = &amp;x;
    }
    println!(&quot;r: {}&quot;, r);
}
</code></pre>
    <p>这段代码有几点需要注意:</p>
    <ul>
        <li><code>let r;</code>的声明方式存在使用<code>null</code>的风险，实际上，当我们不初始化他就使用时，编译器会报错</li>
        <li><code>r</code>引用了内部作用域中<code>x</code>的变量，但是x会在作用域结束时被释放，因此在作用域外，<code>r</code>会引用一个无效的<code>x</code>，此时的<code>r</code>就是一个悬垂指针。</li>
    </ul>
    <h4>14.2 函数中的声明周期</h4>
    <p>先来考虑一个例子，返回两个字符串切片中较长的那个，该函数的参数是两个字符串切片，返回值也是一个字符串切片:</p>
    <pre><code class="language-rust">fn longest(x: &amp;str, y: &amp;str) -&gt; &amp;str {
    if x.len() &gt; y.len() {
        x
    } else {
        y
    }
}
fn main(){
    let string1 = String::from(&quot;abcd&quot;);
    let string2 = &quot;xyz&quot;;
    let result = longest(string1.as_str(), string2);
    println!(&quot;The longest string is {}&quot;, result);
}
</code></pre>
    <p>
        看上去这段代码没有任何问题，实际上，Rust编译器无法编译这段代码，这是因为他无法知道x和y的生命周期跟返回值的声明周期之间的关系是怎么样的，我们需要显示的告诉编译器，这时就需要<code>生命周期标注语法</code>
    </p>
    <h4>14.3 生命周期标注语法</h4>
    <p>简单来说，生命周期的标记是为了告诉编译器代码的声明周期。</p>
    <p>需要注意的是: 标注的生命周期并不会改变任何引用的实际作用域。</p>
    <p>生命周期的语法以单引号<code>'</code>开头，名称往往是一个单独的小写字母，大多数人都用<code>'a</code>来表示生命周期的名称，如果是引用类型的参数，那么生命周期会位与引用符号<code>&amp;</code>之后，并用一个空格来分割:
    </p>
    <pre><code class="language-rust">&amp;i32\t\t // 一个引用
&amp;'a i32\t\t // 一个具有显示生命周期的不可变引用
&amp;'a mut i32  // 一个具有显示生命周期的可变引用
</code></pre>
    <p>一个生命周期标注，它自身并不具有什么意义，因为生命周期的作用就是告诉编译器多个引用之间的关系。例如，有一个函数，它的第一个参数 <code>first</code> 是一个指向 <code>i32</code> 类型的引用，具有生命周期
        <code>'a</code>，该函数还有另一个参数 <code>second</code>，它也是指向 <code>i32</code> 类型的引用，并且同样具有生命周期 <code>'a</code>。此处生命周期标注仅仅说明，<strong>这两个参数
            <code>first</code> 和 <code>second</code> 至少活得和'a 一样久，至于到底活多久或者哪个活得更久，抱歉我们都无法得知</strong>。</p>
    <p><strong>函数中的生命周期标注</strong></p>
    <p>现在，你可以使用生命周期标注来修改之前的<code>longest</code>函数，使它可以运行。</p>
    <pre><code class="language-rust">fn longest&lt;'a&gt;(x:&amp;'a str,y:&amp;'a str)-&gt; &amp;'a str{
    if x.len() &gt; y.len() {
        x
    }else {
        y
    }
}
</code></pre>
    <ul>
        <li>和泛型一样，使用生命周期前，需要先声明<code>&lt;'a&gt;</code></li>
        <li>x、y和返回值至少活得和<code>'a</code>一样久(因为返回值要么是x，要么是y)</li>
    </ul>
    <p>该函数签名表名对于某些生命周期<code>'a</code>，函数的两个参数都至少跟<code>'a</code>活得一样久，同时函数的返回引用也至少跟<code>'a</code>活得一样久，实际上，这意味着返回值的生命周期与参数生命周期中的较小值一致:
        虽然两个参数的生命周期都是标注了<code>'a</code>，但是实际上这两个参数的真实生命周期可能是不一样的。</p>
    <p>我们可以得出一个结论:<strong>在通过函数签名指定生命周期参数时，我们并没有改变传入或返回引用的真实生命周期，而是告诉编译器当不满足次约束条件时，就拒绝编译通过</strong>。</p>
    <h4>14.4 结构体中的生命周期</h4>
    <p>在结构体中使用生命周期只需要为结构体中的每一个引用标注上生命周期即可，例如:</p>
    <pre><code class="language-rust">struct ImportantExcerpt&lt;'a&gt;{
    ptr: &amp;'a str
}

fn main(){
    let novel = String::from(&quot;Call me Ishmael. Some years ago...&quot;);
    let first_sentence = novel.split('.').next().expect(&quot;Could not find a '.'&quot;);
    let i  = ImportantExcerpt{
        ptr: first_sentence
    };
    println!(&quot;{}&quot;, i.ptr);

}
</code></pre>
    <blockquote>
        <p>该结构体中的生命周期标注，表示该结构体中的属性<code>ptr</code>必须比该结构体活得更久。</p>
    </blockquote>
    <p>例如: 下面的代码就无法通过编译:</p>
    <pre><code class="language-rust">fn main (){
    let i;
    {
        let novel = String::from(&quot;Call me Ishmael. Some years ago...&quot;);
        let first_sentence = novel.split('.').next().expect(&quot;Could not find a '.'&quot;);
        i = ImportantExcerpt{
            ptr: first_sentence
        };
    }// novel 的生命周期在此结束，他的引用也无法使用了。
    println!(&quot;{:?}&quot;,i); // error
}
</code></pre>
    <p>他会提示你，借用的值活得没有结构体长。</p>
    <pre><code class="language-rust"> let first_sentence = novel.split('.').next().expect(&quot;Could not find a '.'&quot;);
                     ^^^^^^^^^^^^^^^^ borrowed value does not live long enough
</code></pre>
    <h4>14.5 生命周期消除</h4>
    <p>实际上，对于编译器来说，每一个引用类型都有一个生命周期，那么为什么我们在使用过程中，很多时候都无需标注生命周期呢?例如下面这段代码:</p>
    <pre><code class="language-rust">fn first_word(s: &amp;str) -&gt; &amp;str {
    // 将字符串转为char数组
    let bytes = s.as_bytes();
    println!(&quot;{:?}&quot;,bytes);
    for (i, &amp;item) in bytes.iter().enumerate(){
        if item == b' ' { // 当遇到空格返回空格之前的字符串切片
            return &amp;s[0..i];
        }
    }
    &amp;s[..]
}

fn main(){
    let str = first_word(&quot;abc defg!&quot;);
    println!(&quot;{}&quot;,str);
}
</code></pre>
    <p>对于<code>first_word</code>函数，他的返回值是一个引用类型，那么带引用只有两种情况:</p>
    <ul>
        <li>从函数获取</li>
        <li>从函数体内部新创建的变量获取</li>
    </ul>
    <p>如果是后者，就可能会出现悬垂引用，最终被编译器拒绝，因此只剩一种情况，返回值的引用是获取自参数，这就意味着参数和返回值的生命周期是一样的。</p>
    <p>这里实际上也可以认为Rust帮我们定义生命周期标注，类似:</p>
    <pre><code class="language-rust">fn first_word&lt;'a&gt;(s:&amp;'a str) -&gt; &amp;'a str{}
</code></pre>
    <p>但是需要注意的是:</p>
    <ul>
        <li>消除规则不是万能的，若编译器不能确定某件事是正确时，会直接判断为不正确，那么你还是需要手动标注生命周期</li>
        <li>函数或者方法中，参数的生命周期被称为<code>输入生命周期</code>，返回值的生命周期被称为<code>输出生命周期</code>。</li>
    </ul>
    <p><strong>==生命周期的三条消除规则==</strong></p>
    <p>
        编译器使用三条消除规则来确定哪些场景不需要显示的去标注生命周期，其中第一条规则应用在输出生命周期上，第二、三条用在输出生命周期上。若编译器发现三条规则都不适用时，会报错，提示你需要手动标注生命周期</p>
    <ul>
        <li><strong>每一个引用参数都会获得独自的生命周期</strong></li>
        <li><strong>若只有一个输入生命周期(函数参数中只有一个引用类型)，那么该生命周期会被赋给所有的输入生命周期，也就是所有返回值的生命周期都等于该输入生命周期</strong></li>
        <li><strong>若存在多个输入生命周期，且其中一个是<code>&amp;self</code>或<code>&amp;mut self</code>，则<code>&amp;self</code>的生命周期被赋值给所有的输出生命周期</strong></li>
    </ul>
    <h4>14.6 方法中的生命周期</h4>
    <p>我们可以为方法实现生命周期，他的语法和泛型差不多</p>
    <pre><code class="language-rust">struct ImportantExcerpt&lt;'a&gt;{
    part: &amp;'a str;
}
impl&lt;'a&gt; ImportantExcerpt&lt;'a&gt;{
 \tfn level(&amp;self) -&gt; i32{
        3
    }
}
</code></pre>
    <p>注意:由于生命周期也是结构体的一部分，所以在实现方法的时候，你不能把生命周期给丢了。</p>
    <p>实际上，如果你在方法中并没有使用生命周期<code>'a</code>，你可以简化为这样:</p>
    <pre><code class="language-rust">impl Reader for BufReader&lt;'_&gt; {
    // methods go here
}
</code></pre>
    <blockquote>
        <p>方法签名中往往不需要标注生命周期，得益于生命周期消除的第一和第三规则</p>
    </blockquote>
    <p>下面的例子展示了第三规则应用的场景：</p>
    <pre><code class="language-rust">fn announce_and_return_part(&amp;self,announcement: &amp;str) -&gt; &amp;str{
        println!(&quot;{}&quot;,announcement);
        self.part
    }
</code></pre>
    <p>对于此函数，Rust会首先应用第一规则，变为:</p>
    <pre><code class="language-rust">fn announce_and_return_part&lt;'a,'b&gt;(&amp;'a self,announcement: &amp;'b str) -&gt; &amp;str{
        println!(&quot;{}&quot;,announcement);
        self.part
    }
</code></pre>
    <p>由于参数为多个并且其中一个为<code>self</code>，接着应用第三规则，最后为:</p>
    <pre><code class="language-rust">fn announce_and_return_part&lt;'b&gt;(&amp;'a self,announcement: &amp;'b str) -&gt; &amp;'a str{
        println!(&quot;{}&quot;,announcement);
        self.part
    }
</code></pre>
    <p>这就是Rust的生命周期消除为我们处理的事。</p>
    <p>但如果我们想将返回值的生命周期改为<code>'b</code>呢</p>
    <pre><code class="language-rust">fn announce_and_return_part&lt;'b&gt;(&amp;'a self,announcement: &amp;'b str) -&gt; &amp;'b str{
        println!(&quot;{}&quot;,announcement);
        self.part
    }
</code></pre>
    <p>此时，Rust编译器会报错，</p>
    <pre><code class="language-rust">19 | impl&lt;'a&gt; ImportantExcerpt&lt;'a&gt;{
   |      -- lifetime \`'a\` defined here
...
23 |     fn announce_and_return_part&lt;'b&gt;(&amp;'a self,announcement: &amp;'b str) -&gt; &amp;'b str{
   |                                 -- lifetime \`'b\` defined here
24 |         println!(&quot;{}&quot;,announcement);
25 |         self.part
   |         ^^^^^^^^^ associated function was supposed to return data with lifetime \`'b\` but it is returning data with lifetime \`'a\`
   |
   = help: consider adding the following bound: \`'a: 'b\`
</code></pre>
    <p>这是由于Rust编译器无法知道<code>'b</code>的生命周期到底是多长，如果<code>'b</code>活得比<code>'a</code>要短，那么会出现悬垂引用。因此我们需要告诉Rust编译器，<code>'b</code>和<code>'a</code>之间生命周期的关系。
    </p>
    <pre><code class="language-rust">impl&lt;'a:'b,'b&gt; ImportantExcerpt&lt;'a&gt;{
    fn announce_and_return_part(&amp;'a self,announcement: &amp;'b str) -&gt; &amp;'b str{
        println!(&quot;{}&quot;,announcement);
        self.part
    }
}
</code></pre>
    <p>其中<code>'a:'b</code>是生命周期约束语法，跟泛型非常类似，用于说明<code>'a必须活得比'b久</code>。</p>
    <p>可以把<code>'a</code>和<code>'b</code>都在同一个地方声明如上所示，或者分开声明但通过<code>where 'a:'b</code>约束生命周期,例如:</p>
    <pre><code class="language-rust">impl &lt;'a&gt; ImportantExcerpt{
    fn announce_and_return_part&lt;'b&gt; (&amp;'a self,announcement: &amp;'b str) -&gt; &amp;'b str
        where 'a:'b{
        println!(&quot;{}&quot;,announcement);
        self.part
    }
}
</code></pre>
    <h4>14.7 静态生命周期</h4>
    <p>在Rust中有一个非常特殊的生命周期，那就是<code>'static</code>，拥有该生命周期的引用可以和整个程序活的一样久。</p>
    <p>例如字符串字面量，它是被硬编码进Rust的二进制文件中，因此这些字符串字面量全部都具有<code>'static</code>的生命周期:</p>
    <pre><code class="language-rust">let s: &amp;'static str = &quot;这是一个拥有静态生命周期的字符串字面量。&quot;
</code></pre>
    <ul>
        <li>生命周期<code>'static</code>意味着能和程序活得一样久，例如字符串字面量和特征</li>
        <li>实在遇到解决不了的生命周期标注问题，可以尝试<code>T:'static</code>，有时候会有奇迹。</li>
    </ul>
    <p><strong>&amp;'static和T:'static</strong></p>
    <p><code>'static</code>在Rust中是相当常见的，例如字符串字面量就具有<code>'static</code>生命周期。</p>
    <p>除此之外，特征对象的生命周期也是<code>'static</code>;</p>
    <p>除了<code>&amp;'static</code>之外，还有另外一种场景也可以见到<code>'static</code>的使用:</p>
    <pre><code class="language-rust">use std::fmt::Display;
fn main() {
    let mark_twain = &quot;Samuel Clemens&quot;;
    print(&amp;mark_twain);
}
fn print&lt;T: Display + 'static&gt;(message: &amp;T) {
    println!(&quot;{}&quot;, message);
}
</code></pre>
    <p>例如这里就是将<code>'static</code>作为生命周期约束来使用了。</p>
    <p>那么对于<code>&amp;'static</code>和<code>T: 'static</code>的区别是什么?</p>
    <p>对于字符串字面量来说，它直接被打包到二进制文件中，永远不会被<code>drop</code>，因此他能跟程序活得一样久，自然他的生命周期是<code>'static</code>。</p>
    <blockquote>
        <p>但是，主要注意的是这里的<code>&amp;'static</code>生命周期针对的仅仅是这个变量指向的数据是<code>'static</code>而不是说此变量的生命周期是<code>'static</code>，对于变量来说，还是要遵循响应的作用域规则的。
        </p>
    </blockquote>
    <pre><code class="language-rust">fn get_memory_location() -&gt; (usize,usize){
    // &quot;Hello,World&quot;是字符串字面量，因此他的生命周期是 'static
    // 但是持有他的变量string的生命周期就 不一样了，他完全取决于变量作用域
    // 例如这里的string的生命周期就是当前的函数
    let string = &quot;Hello,World&quot;;
    let pointer = string.as_ptr() as usize;
    let length = string.len();
    (pointer,length)
}// string变量在这里被释放，无法再被访问，但是它引用的数据仍然还会存活

fn get_str_at_location(pointer: usize,length: usize) -&gt; &amp;'static str{
    // 裸指针需要使用unsafe语句块
    unsafe {
        // 将指针指向的内存转换为字符串切片
        from_utf8_unchecked(from_raw_parts(pointer as *const u8,length))
    }
}

fn main(){
    let(pointer,length) = get_memory_location();
    let msg = get_str_at_location(pointer,length );
    println!(&quot;指针地址:{:#X}，长度为:{}，指针指向的数据为:{}&quot;,pointer,length,msg);
    // 指针地址:0x7FF6D032E3D8，长度为:11，指针指向的数据为:Hello,World
}
</code></pre>
    <p>这段程序证明了: <code>&amp;'static</code>的引用确实可以和程序活的一样久，因为在定义这个字符串的函数外，我们通过<code>get_str_at_location</code>还是取到了对应的字符串。</p>
    <p>对于<code>T:'static</code></p>
    <pre><code class="language-rust">fn print_it&lt;T: Debug + 'static&gt;(input: T){
    println!(&quot;'static value passed in is:{:?}&quot;,input);

}

fn print_it1&lt;T: Debug + 'static&gt;(input: impl Debug + 'static){
    println!(&quot;'static value passed in is:{:?}&quot;,input);
}
</code></pre>
    <p>上面的两个函数表示<code>T</code>必须获得和程序一样久，但是当我们这么使用时</p>
    <pre><code class="language-rust">fn main() {
    let i = 5;
    print_it(&amp;i);
    print_it1(&amp;i);
}
</code></pre>
    <p>以上代码会报错，原因是<code>&amp;i</code>的生命周期无法满足<code>'static</code>的约束，如果将i改为常量，那自然ok。</p>
    <blockquote>
        <p>简单来说，<code>T:'static</code>的意思是<code>对T拥有所有权</code>或者<code>不包含非'static生命周期的引用</code>。</p>
    </blockquote>
    <h3>十五、函数式编程</h3>
    <p>函数式语言的特性是:</p>
    <ul>
        <li>使用函数作为参数进行传递</li>
        <li>使用函数作为函数返回值</li>
        <li>将函数赋值给变量</li>
    </ul>
    <p>Rust中使用了函数式编程，他的特性有:</p>
    <ul>
        <li>
            <p>闭包 Closure</p>
        </li>
        <li>
            <p>迭代器 iterator</p>
        </li>
        <li>
            <p>模式匹配 match</p>
        </li>
        <li>
            <p>枚举 enum</p>
        </li>
    </ul>
    <h4>15.1 闭包 closure</h4>
    <p>闭包是一种匿名函数，他可以赋值给变量，也可以作为参数传递给其他函数，不同于函数的是，他允许捕获调用者作用域中的值，例如:</p>
    <pre><code class="language-rust">fn main(){
    let x = 1;
    let sum = |y| x + y;
    assert_eq!(3,sum(2));
}
</code></pre>
    <p>上面的代码展示了一个非常普通的闭包<code>sum</code>，他拥有一个入参<code>y</code>，同时捕获了作用域中的<code>x</code>的值，因此调用<code>sum(2)</code>意味着将2(也就是参数y)跟1(x变量)进行相加，同时返回他们的结果(3);
    </p>
    <p>这里可以看出闭包的定义:<strong>可以赋值给变量，运行捕获调用者作用域中的值</strong>。</p>
    <p>Rust闭包在形式上借鉴了<code>Smalltalk</code>和<code>Ruby</code>语言，与函数最大的不同就是他的参数是通过<code>|param1|</code>的形式进行声明，如果是多个参数就<code>|param1,param2,...|</code>，下面给出闭包的形式定义:
    </p>
    <pre><code class="language-rust">|param1,param2,...|{
    语句1;
    语句2;
    返回表达式
};
</code></pre>
    <p>如果只有一个表达式的话，可以简化为:</p>
    <pre><code class="language-rust">|param1|返回表达式;
</code></pre>
    <p>需要注意两点:</p>
    <ul>
        <li>闭包中最后一行表达式返回的值，就是闭包执行后的返回值。</li>
        <li><code>let sum =
            ||...</code>只是吧闭包赋值给变量<code>sum</code>，并不是吧闭包执行后的结果赋值给<code>sum</code>，因此这里的<code>sum</code>就相当于闭包函数，可以跟函数一样进行调用<code>sum()</code>。
        </li>
    </ul>
    <h5>15.1.1 闭包的类型推导</h5>
    <p>Rust是静态语言，因此所有的变量都具有类型，但是得益于编译器的强大的类型推导，我们在很多时候并不需要进行显式的去声明类型。但是函数并不在此列，我们必须手动的为函数提供所有的参数和返回值的类型。</p>
    <p><strong>与函数相反，闭包并不会作为API对外提供，因此他可以享受编译器的类型推导能力，无需标注参数和返回值的类型。</strong></p>
    <p>但是为了增加代码的可读性，你也可以显式的为闭包添加类型标注。</p>
    <blockquote>
        <p>需要注意的是:对于闭包函数，如果你仅仅进行了声明，但是没有使用，编译器会提示你为参数添加类型标注，因为它缺乏必要的上下文进行推导类型。</p>
    </blockquote>
    <pre><code class="language-rust">let sum = |x,y| x + y;
let v = sum(1,2);
</code></pre>
    <p>这里我们使用了<code>sum</code>同时把<code>1,2</code>作为参数传了进去，因此编译器才可以推导出<code>x,y</code>的类型为<code>i32</code>。</p>
    <p>下面是实现了同一个功能的函数和闭包:</p>
    <pre><code class="language-rust">fn  add_one_v1   (x: u32) -&gt; u32 {x + 1}
let add_one_v2 = |x: u32| -&gt; u32 {x + 1};
let add_one_v3 = |x|\t\t\t {x + 1};
let add_one_v4 = |x|\t\t\t  x + 1 ;
</code></pre>
    <p>这几个函数和闭包的功能是完全一致的，但是他们使用了不同的形式进行书写。</p>
    <p><code>v2</code>使用了完整的表示方式，标注了<code>参数类型</code>，<code>返回值类型</code>和<code>括号</code>。</p>
    <p><code>v4</code>是闭包最简洁的实现，他省略了所有可以省略的类型和括号。</p>
    <blockquote>
        <p>虽然类型推导很好用，但是他不是泛型，当编译器推导出一种类型后，他就会一致使用该类型</p>
    </blockquote>
    <p>例如:</p>
    <pre><code class="language-rust">let example_closure = |x| x;

let s = example_closure(String::from(&quot;hello&quot;));
let n = example_closure(5); // error expected String but found integer
</code></pre>
    <h5>15.1.2 结构体中的闭包</h5>
    <p>如果我们需要设计一个简易缓存，功能是获取一个值，染回将其缓存起来，可以这样设计:</p>
    <ul>
        <li>一个闭包用于获取值</li>
        <li>一个变量，用于存储该值</li>
    </ul>
    <p>可以使用结构体来代表缓存对象:</p>
    <pre><code class="language-rust">struct Cached&lt;T&gt; where T: Fn(u32) -&gt; u32,{
    query: T,
    value: Option&lt;u32&gt;,
}
</code></pre>
    <p>这里的<code>Fn(u32) -&gt; u32</code>是一个特征，用来表示<code>T</code>是一个闭包类型，他意味着<code>query</code>的类型是<code>T</code>，该类型必须实现了响应的闭包特征<code>Fn(u32) -&gt; u32</code>。
    </p>
    <p>接着，为缓存结构体实现方法:</p>
    <pre><code class="language-rust">impl&lt;T&gt; Cached&lt;T&gt;
    where T: Fn(u32) -&gt; u32{

    /// 用于创建缓存的方法
    fn new(query:T) -&gt; Self{
        Cached{
            query,
            value: None,
        }
    }
    /// 用于查询缓存值是否有指定的值的方法
    /// 如果没有，则缓存这个值并返回
    fn value(&amp;mut self,arg: u32) -&gt; u32 {
        match self.value{
            Some(v) =&gt; v,
            None =&gt; {
                let v = (self.query)(arg);
                self.value = Some(v);
                v
            }
        }
    }

}
</code></pre>
    <p>使用这个缓存结构体:</p>
    <pre><code class="language-rust">fn main() {
    let mut cached = Cached::new(|x| x * x);
    // let v = cached.value(12);
    println!(&quot;{}&quot;, v);

}
</code></pre>
    <p>这里是创建了一个缓存给订的数据的平方的闭包函数。</p>
    <h5>15.1.3 捕获作用域中的值</h5>
    <p>闭包与函数最大的不同就是他可以获取作用域中的值，例如:</p>
    <pre><code class="language-rust">fn main(){
    let x = 4;
    let equal_to_x = |z| x==z;
    let y = 4;
    assert!(equal_to_x(y));
}
</code></pre>
    <p>上面的代码中，闭包<code>equal_to_x</code>中的<code>x</code>并不是他的参数，但是他依然可以去使用<code>x</code>，因为<code>equal_to_x</code>在<code>x</code>的作用域范围内，所以<code>x</code>无需声明就可以使用。
    </p>
    <p>对于函数来说，就算你把函数定义在<code>main</code>中，他也不能访问<code>x</code>:</p>
    <pre><code class="language-rust">fn main(){
    let x = 4;
    fn equal_to_x(z:i32) -&gt; bool{
        z==x // error
    }
    let y = 4;
    assert!(equal_to_x(y));
}
</code></pre>
    <h5>15.1.4 三种Fn特征</h5>
    <p>闭包捕获变量有三种途径，恰好对应函数参数的三种传入方式: <code>转移所有权</code>、<code>可变借用</code>、<code>不可变借用</code>，因此相应的<code>Fn</code>特征也有三种:</p>
    <h6><strong>FnOnce特征</strong></h6>
    <p>该类型的闭包会拿走被捕获变量的所有权。<code>Once</code>顾名思义，说明该闭包只可以使用一次:</p>
    <pre><code class="language-rust">fn fn_once&lt;F&gt;(func:F)
where F: FnOnce(usize) -&gt; bool{
    println!(&quot;{}&quot;, func(3));
    println!(&quot;{}&quot;, func(4)); // 这里是无法调用的，x已经被释放了
}

fn main(){
    let x = vec![1, 2, 3];
    fn_once(|z| z == x.len());
}
</code></pre>
    <p>仅实现<code>FnOnce</code>特征的闭包在调用时会转移所有权，所以显然不能对已失去所有权的闭包变量进行二次调用。</p>
    <p>在编译上面的代码时，编译器会提醒你是不是忘了添加Copy特征，所以会报错，那我们添加一个约束，试试实现了Copy的闭包。</p>
    <pre><code class="language-rust">fn fn_once&lt;F&gt;(func:F)
where F: FnOnce(usize) -&gt; bool+Copy{
    println!(&quot;{}&quot;, func(3));
    println!(&quot;{}&quot;, func(4));
}
</code></pre>
    <p>我们编译并运行，程序输出了</p>
    <pre><code class="language-rust">true
false
</code></pre>
    <p>这里说明如果你添加了Copy约束后，调用时使用的将是他的拷贝，所以并没有发生所有权的转移。</p>
    <p>如果你想强制闭包去的捕获变量的所有权，可以在参数列标签添加<code>move</code>关键字，这种用法通常用于闭包的生命周期大于捕获变量的生命周期，例如将闭包返回或移入其他线程:</p>
    <pre><code class="language-rust">use std::thread;
let v = vec![1, 2, 3];
let handle = thread::spawn(move || {
    println!(&quot;Here's a vector: {:?}&quot;, v);
});
handle.join().unwrap();
</code></pre>
    <h6><strong>FnMut特征</strong></h6>
    <p>他以可变借用的方式捕获了环境中的值，因此可以修改该值:</p>
    <pre><code class="language-rust">fn main(){
    let mut str = String::from(&quot;Hello,&quot;);
    let mut update_str = |s| str.push_str(s);
    update_str(&quot;World&quot;);
    println!(&quot;{}&quot;, str);
}
</code></pre>
    <p>注意，如果需要使用可变借用，则需要将<code>update_str</code>闭包函数修改为<code>mut</code>可变的，否则编译器会提示无法借用一个可变变量。</p>
    <p>你也可以写成这样:</p>
    <pre><code class="language-rust">fn exec&lt;'a,F:FnMut(&amp;'a str)&gt;(mut f: F){
    f(&quot;World&quot;);
}
fn main(){
    let mut str = String::from(&quot;Hello,&quot;);
    exec(|s| str.push_str(s));
    println!(&quot;{}&quot;, str);
}
</code></pre>
    <h6><strong>Fn特征</strong></h6>
    <p>他以不可变借用的方式捕获环境中的值,让我们把上面的代码中<code>exec</code>的<code>F</code>特征参数修改为<code>Fn(&amp;'a str)</code></p>
    <pre><code class="language-rust">fn exec2&lt;'a,F:Fn(&amp;'a str)&gt;(f:F){
    f(&quot;world&quot;);
}

fn main(){
    let str = String::from(&quot;Hello&quot;);
    exec2(|s| println!(&quot;{},{}&quot;,str,s ));
}
</code></pre>
    <p><strong>三种Fn的关系</strong></p>
    <p>实际上,一个闭包并不仅仅实现某一种<code>Fn</code>特征,规则如下:</p>
    <ul>
        <li>所有的闭包都自动实现了<code>FnOnce</code>特征,因此任何一个闭包都至少可以被调用一次</li>
        <li>没有移除捕获变量的所有权的闭包自动实现了<code>FnMut</code>特征</li>
        <li>不需要对捕获变量进行改变的闭包自动实现了<code>Fn</code>特征</li>
    </ul>
    <blockquote>
        <p>一个闭包实现了哪种Fn特征取决于该闭包如何使用被捕获的变量,而不是取决于闭包如何捕获他们，跟是否使用Move没有关系</p>
    </blockquote>
    <h5>15.1.5 闭包作为函数返回值</h5>
    <p>如果我们需要将闭包作为函数返回值，该怎么做:</p>
    <pre><code class="language-rust">fn factory() -&gt; Fn(i32) -&gt; i32 {
    let num = 5;

    |x| x + num
}

let f = factory();

let answer = f(1);
assert_eq!(6, answer);
</code></pre>
    <p>
        上面这段代码，看起来似乎没有问题，但是Rust编译器却无法编译，原因是Rust要求函数的参数和返回类型，必行有固定的内存大小，但是不包括特征，因为特征类似接口，对于编译器来说，无法知道他后面藏的真实类型是什么，因为也无法得知具体的大小。</p>
    <p>由于是特征，所以我们可以这样返回:</p>
    <pre><code class="language-rust">fn factory() -&gt; impl Fn(i32) -&gt; i32{
    let num = 5;
    |x| x + num
}
</code></pre>
    <p>但是这样又会有一个问题，我们只能返回相同的类型，例如:</p>
    <pre><code class="language-rust">fn factory() -&gt; impl Fn(i32) -&gt; i32{
    let num = 5;
    if num &gt; 1 {
        move |x| x + num
    }else{
        move |x| x - num
    }
}
</code></pre>
    <p>编译器会提示你返回了两个不同的类型，这时你只能使用特征对象来进行返回:</p>
    <pre><code class="language-rust">fn factory() -&gt;  Box&lt;dyn Fn(i32) -&gt; i32&gt;{
    let num = 5;

    if num &gt; 1 {
        Box::new(move |x| x + num)
    }else{
        Box::new(move |x| x - num)
    }
}
</code></pre>
    <h4>15.2 迭代器Iterator</h4>
    <p>迭代器和For循环颇为相似，都是去遍历一个集合，他们最主要的差别就是: 是否通过索引来访问集合</p>
    <p>例如，这里的java代码就是循环:</p>
    <pre><code class="language-java">String[] arr = {&quot;a&quot;,&quot;b&quot;,&quot;c&quot;,&quot;d&quot;};
for(int i = 0;i &lt; arr.length; i++){
    System.out.println(arr[i]);
}
</code></pre>
    <p>我们对比下Rust中的For循环</p>
    <pre><code class="language-rust">let arr = [1,2,3];
for v in arr{
    println!(&quot;{}&quot;,v);
}
</code></pre>
    <p>与Java的For不同，Rust这里没有使用索引，他把<code>arr</code>数组当做一个迭代器，直接去遍历其中的元素，但是数组并不是迭代器，我们可以对他的元素进行迭代的原因是数组实现了<code>IntoIterator</code>特征，Rust通过for语法糖，自动把实现了该特征的数组类型转换为迭代器，例如:
    </p>
    <pre><code class="language-rust">for i in 1..10{
    println!(&quot;{}&quot;,i); // 将会依次打印1,2,4,5...10
}
</code></pre>
    <p><code>IntoIterator</code>特征拥有一个<code>into_iter</code>方法，因此我们还可以显式的吧数组转换成迭代器:</p>
    <pre><code class="language-rust">let arr = [1,2,3,4];
for v in arr.into_iter(){
    println!(&quot;{}&quot;,v);
}
</code></pre>
    <h5>15.2.1 惰性初始化</h5>
    <p>在Rust中，迭代器是惰性的，意味着如果你不使用它，那么它将不会发生任何事。</p>
    <pre><code class="language-rust">let v1 = vec![1, 2, 3];

let v1_iter = v1.iter();

for val in v1_iter {
    println!(&quot;{}&quot;, val);
}
</code></pre>
    <p>在for循环开始之前，即使你创建了迭代器对象，也不会发生任何操作，只有在进行循环时，迭代器才会工作。</p>
    <p>这种惰性初始化的方式确保了创建迭代器不会有任何额外的性能损耗，其中的元素也不会被消耗，只有使用到该迭代器时，才开始。</p>
    <blockquote>
        <p>into_iter()和iter()的区别是是否获取所有权，而前者会获取需要迭代的数组的所有权，后者只是不可变借用</p>
    </blockquote>
    <h5>15.2.2 next()方法</h5>
    <p>使用了迭代器，如何从迭代器中获取元素呢，这时就使用到了<code>next()</code>方法</p>
    <pre><code class="language-rust">pub trait Iterator{
    type Item;
    fn next(&amp;mut self) -&gt; Option&lt;Self::Item&gt;;
    //...
}
</code></pre>
    <p>迭代器之所以为迭代器，就是因为它实现了<code>Iterator</code>特征。</p>
    <p>所以其实for循环就是在隐式的调用next方法，来获取迭代器中的元素。</p>
    <pre><code class="language-rust">fn main(){
    let arr = [1,2,3,4];
    let mut iter = arr.into_inter();
    assert!(iter.next(),Some(1));
    assert!(iter.next(),Some(2));
    assert!(iter.next(),some(3));

}
</code></pre>
    <ul>
        <li><code>next()</code>方法返回的是Option类型，当有值时返回<code>Some(i32)</code>，无值时返回<code>None</code></li>
        <li>遍历是按照迭代器中元素的排列顺序依次进行的，因此我们严格按照数组中元素的顺序取出了1,2,3</li>
        <li>手动迭代必须将迭代器声明为<code>mut</code>可变，因为调用next会改变迭代器中的状态数据(例如当前遍历的位置)</li>
    </ul>
    <h5>15.2.3 获取迭代器方法</h5>
    <p><strong>into_iter(),iter(),iter_mut()</strong></p>
    <ul>
        <li><code>into_iter()</code> 会借用所有权</li>
        <li><code>iter()</code> 是借用</li>
        <li><code>iter_mut()</code> 是可变借用</li>
    </ul>
    <p>需要注意的是:</p>
    <ul>
        <li><code>iter()</code>迭代器next方法返回的类型是<code>Some(&amp;T)</code>,而<code>into_iter()</code>迭代器由于获取了所有权，所以他返回的类型是<code>Some(T)</code></li>
        <li>由于<code>iter_mut()</code>迭代器的返回类型为<code>Some(&amp;mut T)</code>所以我们获取到<code>v= &amp;mut T</code>之后可以使用<code>*v = xx</code>来改变值。</li>
    </ul>
    <h5>15.2.4 消费者与适配器</h5>
    <p><strong>消费者适配器</strong></p>
    <p>消费者指迭代器上的方法，他会消费掉迭代器中的元素，原因是他内部使用了迭代器的next方法。</p>
    <p>例如，<code>sum()</code>方法，他会拿走迭代器的所有权</p>
    <pre><code class="language-rust">fn main() {
    let v1 = vec![1, 2, 3];

    let v1_iter = v1.iter();

    let total: i32 = v1_iter.sum();

    assert_eq!(total, 6);

    // v1_iter 是借用了 v1，因此 v1 可以照常使用
    println!(&quot;{:?}&quot;,v1);

    // 以下代码会报错，因为 \`sum\` 拿到了迭代器 \`v1_iter\` 的所有权
    // println!(&quot;{:?}&quot;,v1_iter);
}
</code></pre>
    <p><strong>迭代器适配器</strong></p>
    <p>迭代器适配器，会返回一个新的迭代器，它是实现链式方法调用的关键。</p>
    <p>与消费者适配器不同，迭代器适配器是惰性的，意味着你<strong>需要一个消费者适配器来收尾，最终将迭代器转换成一个具体的值</strong>：</p>
    <pre><code class="language-rust">fn main(){
    let arr = vec!(1, 2, 3, 4);
    let res: Vec&lt;_&gt; = arr.iter().map(|x| x + 1).collect();
    println!(&quot;{:?}&quot;,res);
}
</code></pre>
    <p>上面的代码中，使用了<code>collect</code>方法，该方法就是一个消费者适配器，使用它可以将一个迭代器中的元素收集到指定的类型中，这里我们为res标注了<code>Vec&lt;_&gt;</code>类型，表示由编译器自动推导。
    </p>
    <p>至于为何需要我们手动标注类型，是因为<code>collect</code>很强大，他可以收集成多种不同的集合，<code>Vec&lt;T&gt;</code>仅仅是其中之一。</p>
    <p>而<code>map</code>方法会对迭代器中的每一个值进行一系列操作，然后把该值转换成另一个新值，该操作是通过闭包来实现的。</p>
    <p>通过<code>collect</code>可以将一个数组收集成<code>HashMap</code>集合</p>
    <pre><code class="language-rust">fn main(){
    let index = [0, 1, 2, 3];
    let names = [&quot;Hello&quot;, &quot;,&quot;, &quot;World&quot;, &quot;!&quot;];
    let to_hash:HashMap&lt;_,_&gt; = index.iter().zip(names.into_iter()).collect();
    println!(&quot;{:?}&quot;, to_hash);
}
</code></pre>
    <p><code>zip</code>是一个迭代适配器，他的作用就是将两个迭代器的内容压缩到一起，形成<code>Iterator&lt;Item=(ValueFromA，ValueFromB)&gt;</code>这样的新迭代器，在在此处就是形如<code>[(index,name1),(index,name2)]</code>这样的迭代器，然后在通过<code>collect</code>将新迭代器中以<code>key，value</code>的形式收集成<code>HashMap&lt;K,V&gt;</code>,所以我们需要告诉编译器，我们需要收集成什么样的数据。
    </p>
    <p><strong>闭包作为适配器参数</strong></p>
    <p>我们使用闭包来作为迭代器适配器的参数，它最大的好处不仅仅在于可以就地实现迭代器中元素的处理，还在于可以捕获环境值。</p>
    <pre><code class="language-rust">#[derive(Debug)]
struct Shoe{
    size: u32,
    style:String,
}

fn shoe_in_size(shoes:Vec&lt;Shoe&gt;,shoe_size:u32) -&gt; Vec&lt;Shoe&gt;{
    shoes.into_iter().filter(|x| x.size == shoe_size).collect()
}

fn main(){
    let mut shoes:Vec&lt;Shoe&gt; = Vec::new();
    let s1 = Shoe{
        size: 39,
        style: &quot;Style1&quot;.to_string(),
    };
  \t/*
  \t...
  \t*/
    shoes.push(s1);
    shoes.push(s2);
    shoes.push(s3);
    shoes.push(s4);
    let my_shoes = shoe_in_size(shoes, 39);
    println!(&quot;{:?}&quot;, my_shoes);
}
</code></pre>
    <h5>15.2.5 实现Iterator特征</h5>
    <p>实际上，不仅仅是数组，基于其他集合类型一样可以创建迭代器，例如:HashMap，你也可以创建自己的迭代器，只要为自定义类型实现Iterator特征即可。</p>
    <pre><code class="language-rust">struct Counter{
    count: u32
}
impl Counter {
    fn new()-&gt;Self{
        Counter{
            count:0
        }
    }
}
impl Iterator for Counter {
    type Item = u32;

    fn next(&amp;mut self) -&gt; Option&lt;Self::Item&gt; {
        if self.count &lt; 10 {
            self.count += 1;
            Some(self.count)
        }else{
            None
        }
    }
}
fn main(){
    let c = Counter::new();
    for num in c.into_iter() {
        println!(&quot;{}&quot;, num);
    }
}
</code></pre>
    <p><strong>enumerate</strong></p>
    <p>方法<code>enumerate</code>是一个迭代器适配器，因此他会返回一个新的迭代器。</p>
    <p>看看这一段代码:</p>
    <pre><code class="language-rust">let v = vec![1u64, 2, 3, 4, 5, 6];
for (i,v) in v.iter().enumerate() {
    println!(&quot;第{}个值是{}&quot;,i,v)
}
</code></pre>
    <p><code>enumerate()</code>方法会包装一个迭代器对象，他实现的<code>next()</code>方法返回一个<code>Option&lt;i32,T&gt;</code>类型的对象，前一个表示元素的索引。</p>
    <h2>十六、深入类型</h2>
    <h3>16.1 newtype和类型别名</h3>
    <p><code>newtype</code>就是使用元组结构体的方式将已有的类型包裹起来例如:</p>
    <p><code>struct Meters(u32)</code>,那么此处的<code>Meters</code>就是一个<code>newtype</code></p>
    <p>newtype的好处</p>
    <ul>
        <li>自定义类型可以让我们给出更多有意义和可读性的类型名，例如与其使用u32作为距离的单位类型，我们可以使用上面的Meters</li>
        <li>对于某些场景，只有<code>newtype</code>可以很好的解决</li>
        <li>隐藏内部类型的细节</li>
    </ul>
    <p>例如我们之前讲过的，Rust实现特征的一个<strong>孤儿规则</strong>:要为类型A实现特征T，那么类型A和特征T至少有一个要在当前的作用范围内。</p>
    <p>这时如果我们需要<strong>对外部类型实现外部特征</strong>，只能使用newtype</p>
    <p>现在，我们想要为<code>Vec</code>实现直接打印的方式，需要为他实现<code>Display</code>特征</p>
    <pre><code class="language-rust">use std::fmt::{Display, Formatter};

struct Wrapper(Vec&lt;String&gt;);

impl Display for Wrapper{
    fn fmt(&amp;self, f: &amp;mut Formatter&lt;'_&gt;) -&gt; std::fmt::Result {
        write!(f,&quot;[\\n{}\\n]&quot;,self.0.join(&quot;,&quot;))
    }
}
fn main() {
    let wrapper = Wrapper(vec!{&quot;1&quot;.to_string(),&quot;2&quot;.to_string(),&quot;3&quot;.to_string()});
    println!(&quot;{}&quot;,wrapper);
}

</code></pre>
    <p><strong>隐藏内部的细节</strong></p>
    <p>newtype还有一个作用就是隐藏细节，例如我们不想用户调用调用某个类型的方法，就将这个类型包装起来</p>
    <pre><code class="language-rust">struct Meters(u32);
fn main(){
    let i: u32 = 2;
    assert_eq!(i.pow(2),4);
    let n = Meters(2);

    assert_eq!(n.pow(2),4); // error n没有这个方法
}
</code></pre>
    <h4>16.1.1 类型别名</h4>
    <p>除了使用<code>newtype</code>，我们还可以使用一个更传统的方式来创建新类型:</p>
    <pre><code class="language-rust">type Meters  = u32;
</code></pre>
    <p>但是需要注意的是，**类型别名并不是一个独立的全新类型，而是一个类型的别名，**因此编译器依然会把<code>Meters</code>当做<code>u32</code>来使用。</p>
    <p><strong>类型别名减少代码的模块</strong></p>
    <pre><code class="language-rust">fn main() {
    let f: Box&lt;dyn Fn() + Send + 'static&gt; = Box::new(|| println!(&quot;HI&quot;));
    fn takes_long_type(f:Box&lt;dyn Fn() + Send + 'static&gt;){
            f;
    }
    fn returns_long_type(f:Box&lt;dyn Fn() + Send + 'static&gt;){
        f;
    }
}
</code></pre>
    <p>可以看出变量<code>f</code>的类型非常长，导致我们后面也需要很多的字符串</p>
    <p>这时可以使用<code>type</code>来定义模块类型</p>
    <pre><code class="language-rust">type Thunk = Box&lt;dyn Fn() + Send + 'static&gt;;

fn main(){
    let f :Thunk = Box::new(||println!(&quot;hi&quot;));
    fn takes_long_type(f:Thunk){
        f;
    }
    fn returns_loong_type(f:Thunk){
        f;
    }
}
</code></pre>
    <p><strong>永不返回类型</strong></p>
    <p>Rust的返回值可以概括为三种<code>基础类型与自定义类型</code>、<code>()单元类型</code>以及<code>!永不返回类型</code>。</p>
    <pre><code class="language-rust">fn main(){
    let i = 2;
    let v = match i {
        0..3 =&gt; i,
        _ =&gt; println!(&quot;{}&quot;,i) // error 因为返回了()单元类型，期望为整数类型
    }

}
</code></pre>
    <p>此时，使用!永不返回类型可以通过编译</p>
    <pre><code class="language-rust">fn main(){
    let i = 2;
    let v = match i{
        0..3 =&gt; i,
        _ =&gt; pain!(&quot;出现了预期之外的错误:{}&quot;,i)
    }
}
</code></pre>
    <blockquote>
        <p>这里pain!的返回类型就是 !永不返回 类型，既然他不会返回任何值，那自然不会存在分支类型不匹配的情况的。</p>
    </blockquote>
    <h3>16.2 Sized和不定长类型DST</h3>
    <p>如果从编译器何时能获知类型大小的角度出发，可以分为两类:</p>
    <ul>
        <li>定长类型(sized)，这些类型的大小在编译时是已知的</li>
        <li>不定长类型(unsized)，与定长相反，他的大小只有到了运行时才能动态获知，这种类型又称<code>DST(dynamically sized type)</code></li>
    </ul>
    <p>包括<code>Vec</code>、<code>String</code>、<code>HashMap</code>等类型，其实都是定长类型，这些类型的大小是在编译时能确定的。</p>
    <p>这是因为这些类型在栈上只是(指针，容量，长度)三个整数的大小，实际大小动态变化的部分在堆上，而编译器只关心栈上的大小。</p>
    <p><strong>切片是一个典型的DST类型</strong></p>
    <p><strong>str</strong></p>
    <p><code>str</code>类型既不是<code>String</code>也不是<code>&amp;str</code>切片字符串，它仅仅只是一个<code>str</code>，它是一个动态类型，同时还是<code>String</code>和<code>&amp;str</code>的底层数据类型，由于str是动态的，因此他的大小只有在运行时才知道，所以它是一个DST类型。
    </p>
    <pre><code class="language-rust">// error
let s1: str = &quot;Hello there!&quot;;
let s2: str = &quot;How's it going?&quot;;

// ok
let s3: &amp;str = &quot;on?&quot;
</code></pre>
    <p>Rust需要明确的知道一个特定类型的值占据了多少内存空间。</p>
    <p>那么为何<code>&amp;str</code>就具有固定大小呢，这是由于他的引用存储在栈上，具有固定大小(类似指针)。</p>
    <p>与<code>&amp;str</code>类似，<code>String</code>字符串也是固定大小的类型。</p>
    <p>而将一个动态大小类型转换为固定大小的类型的条件是:</p>
    <ul>
        <li>
            <p>使用引用指向这些动态数据，然后在引用中存储相关的内存位置、长度等信息。</p>
        </li>
    </ul>
    <p><strong>特征对象也是一种DST</strong></p>
    <pre><code class="language-rust">fn foobar_1(thing: &amp;dyn MyThing){}\t \t// ok
fn foobar_1(thing: Box&lt;dyn MyThing){} \t// ok
fn foobar_1(thing: Mything){}\t\t\t// Error
</code></pre>
    <blockquote>
        <p>Rust中常用的DST类型有str、[T]、dyn Trait，他们都无法单独使用，必须要通过引用或Box来间接使用。</p>
    </blockquote>
    <h4>16.2 .1 Sized特征</h4>
    <p>Rust是通过特征来保证我们的泛型参数是固定大小的，例如:</p>
    <pre><code class="language-rust">fn generic&lt;T&gt;(t:T){

}
</code></pre>
    <p>例如上面的这个函数，Rust是如何保证T在编译时的大小的呢?</p>
    <p>奥秘在于编译器自动帮我们加上了<code>Sized</code>特征约束</p>
    <pre><code class="language-rust">fn generic&lt;T:Sized&gt;(t:T){

}
</code></pre>
    <p>这里的Sized特征表示函数只能应用实现了Sized特征的类型，而<strong>所有在编译时就能知道其大小的类型，都会自动实现<code>Sized</code>特征</strong>。</p>
    <p>但是!如果你还是非常想要在泛型函数中使用动态数据类型怎么办?</p>
    <p><strong>你可以使用<code>?Sized</code>特征</strong></p>
    <pre><code class="language-rust">fn generic&lt;T: ?Sized&gt;(t: &amp;T){

}
</code></pre>
    <p><code>?Sized</code>特征用于标明类型<code>T</code>既有可能是固定大小的类型，也可能是动态大小的类型。还有一点要注意的是，函数参数类型从<code>T</code>变成了<code>&amp;T</code>，因为T可能是动态大小的，因此需要用一个固定大小的指针来包裹它。
    </p>
    <h3>16.3 枚举和整数</h3>
    <p>Rust如何将整数转为枚举</p>
    <p><strong>使用第三方库</strong></p>
    <p>Cargo.toml</p>
    <pre><code class="language-toml">[dependencies]
num-traits = &quot;0.2.14&quot;
num-derive = &quot;0.3.3&quot;
</code></pre>
    <pre><code class="language-rust">use num_derive::FromPrimitive;
use num_traits::FromPrimitive;

#[derive(FromPrimitive)]
enum MyEnum {
    A = 1,
    B,
    C,
}

fn main() {
    let x = 2;

    match FromPrimitive::from_i32(x) {
        Some(MyEnum::A) =&gt; println!(&quot;Got A&quot;),
        Some(MyEnum::B) =&gt; println!(&quot;Got B&quot;),
        Some(MyEnum::C) =&gt; println!(&quot;Got C&quot;),
        None            =&gt; println!(&quot;Couldn't convert {}&quot;, x),
    }
}

</code></pre>
    <p><strong>TryFrom + 宏</strong></p>
    <pre><code class="language-rust">use std::convert::TryFrom;

impl TryFrom&lt;i32&gt; for MyEnum {
    type Error = ();

    fn try_from(v: i32) -&gt; Result&lt;Self, Self::Error&gt; {
        match v {
            x if x == MyEnum::A as i32 =&gt; Ok(MyEnum::A),
            x if x == MyEnum::B as i32 =&gt; Ok(MyEnum::B),
            x if x == MyEnum::C as i32 =&gt; Ok(MyEnum::C),
            _ =&gt; Err(()),
        }
    }
}
use std::convert::TryInto;

fn main() {
    let x = MyEnum::C as i32;

    match x.try_into() {
        Ok(MyEnum::A) =&gt; println!(&quot;a&quot;),
        Ok(MyEnum::B) =&gt; println!(&quot;b&quot;),
        Ok(MyEnum::C) =&gt; println!(&quot;c&quot;),
        Err(_) =&gt; eprintln!(&quot;unknown number&quot;),
    }
}
</code></pre>
    <p>但是这样的方式有一个缺陷，那就是你必须为每个枚举成员都实现一个转换分支</p>
    <p>你可以使用宏来进行简化</p>
    <pre><code class="language-rust">#[macro_export]
macro_rules! back_to_enum {
    ($(#[$meta:meta])* $vis:vis enum $name:ident {
        $($(#[$vmeta:meta])* $vname:ident $(= $val:expr)?,)*
    }) =&gt; {
        $(#[$meta])*
        $vis enum $name {
            $($(#[$vmeta])* $vname $(= $val)?,)*
        }

        impl std::convert::TryFrom&lt;i32&gt; for $name {
            type Error = ();

            fn try_from(v: i32) -&gt; Result&lt;Self, Self::Error&gt; {
                match v {
                    $(x if x == $name::$vname as i32 =&gt; Ok($name::$vname),)*
                    _ =&gt; Err(()),
                }
            }
        }
    }
}

back_to_enum! {
    enum MyEnum {
        A = 1,
        B,
        C,
    }
}
</code></pre>
    <p><strong>std::mem::transmute</strong></p>
    <p>当你知道数值一定不会超过枚举的范围时可以使用，例如枚举成员对应1,2,3而你传入的整数也在这个范围内</p>
    <pre><code class="language-rust">// 使用repr()来控制底层类型的大小，免得本来需要i32结果传入i64
#[repr(i32)]
enum MyEnum {
    A = 1, B, C
}

fn main() {
    let x = MyEnum::C;
    let y = x as i32;
    let z: MyEnum = unsafe { std::mem::transmute(y) };

    // match the enum that came from an int
    match z {
        MyEnum::A =&gt; { println!(&quot;Found A&quot;); }
        MyEnum::B =&gt; { println!(&quot;Found B&quot;); }
        MyEnum::C =&gt; { println!(&quot;Found C&quot;); }
    }
}
</code></pre>
    <h2>十七、智能指针</h2>
    <p>智能指针往往是基于结构体实现，他与我们自定义的结构体最大的区别在于，它实现了<code>Deref</code>和<code>Drop</code>特征:</p>
    <ul>
        <li><code>Deref</code>可以让智能指针像引用那样工作，这样你就可以写出同时支持智能指针和引用的代码，例如<code>*T</code></li>
        <li><code>Drop</code>允许你指定智能指针超出作用域后自动执行的代码，例如释放堆内存的对象</li>
    </ul>
    <h3>17.1 Box&lt;T&gt;堆对象分配</h3>
    <p>关于堆栈的性能:</p>
    <ul>
        <li>小型数据，在栈上分配性能和读取性能都要比堆上高</li>
        <li>中性数据，栈上分配性能更高，但是读取性能和堆上并无区别，因为无法利用寄存器或CPU高速缓存，最终还是要经过一次内存寻址。</li>
        <li>大型数据，只建议在堆上分配和使用。</li>
    </ul>
    <p>使用Box的场景</p>
    <ul>
        <li>特意的将数据分配在堆上</li>
        <li>数据较大时，又不想在转移所有权时进行数据拷贝</li>
        <li>类型的大小在编译器无法确定，但是我们有需要固定大小的类型时。</li>
        <li>特征对象，用于说明对象实现了一个特征，而不是某个特定的类型。</li>
    </ul>
    <p><strong>使用Box将数据存储在堆上</strong></p>
    <pre><code class="language-rust">fn main() {
    let a = Box::new(5);
    println!(&quot;{}&quot;,a);
    let b = *a + 1;
}
</code></pre>
    <p>如果普通的使用<code>let a = 5;</code>的话，那么5自然会被存储在栈上，但是如果使用了智能指针，那么5会被放置在堆上。</p>
    <p><strong>栈上和堆上数据的拷贝</strong></p>
    <p>当栈上数据发生所有权转移时，实际上是将数据深拷贝了一份，因此所有权并未真正的转移</p>
    <p>而堆上数据则不一样，底层数据并不会拷贝，转移所有权仅仅是赋值一份栈中的指针，再将新的指针赋予新的变量，然后让旧的指针失效，这样就完成了所有权的转移。</p>
    <pre><code class="language-rust">fn main() {
    // 在栈上创建一个长度为1000的数组
    let arr = [0;1000];
    // 将arr所有权转移arr1，由于 \`arr\` 分配在栈上，因此这里实际上是直接重新深拷贝了一份数据
    let arr1 = arr;

    // arr 和 arr1 都拥有各自的栈上数组，因此不会报错
    println!(&quot;{:?}&quot;, arr.len());
    println!(&quot;{:?}&quot;, arr1.len());

    // 在堆上创建一个长度为1000的数组，然后使用一个智能指针指向它
    let arr = Box::new([0;1000]);
    // 将堆上数组的所有权转移给 arr1，由于数据在堆上，因此仅仅拷贝了智能指针的结构体，底层数据并没有被拷贝
    // 所有权顺利转移给 arr1，arr 不再拥有所有权
    let arr1 = arr;
    println!(&quot;{:?}&quot;, arr1.len());
    // 由于 arr 不再拥有底层数组的所有权，因此下面代码将报错
    // println!(&quot;{:?}&quot;, arr.len());
}
</code></pre>
    <p><strong>将动态大小的类型转换为Sized固定大小的类型</strong></p>
    <pre><code class="language-rust">enum List{
    Cons(i32,List), // error 递归类型List具有无限长的大小
    Nil,
}
</code></pre>
    <p>使用智能指针可以解决这个问题</p>
    <pre><code class="language-rust">enum List{
    Cons(i32,Box&lt;List&gt;),
    Nil,
}
</code></pre>
    <p><strong>解引用获取Box中的数据</strong></p>
    <pre><code class="language-rust">fn main(){
    let arr = vec![Box::new(1),Box::new(2)];
    let (first, second) = (&amp;arr[0],&amp;arr[1]);
    let sum = **first + ** second;
}
</code></pre>
    <p><strong>Box::leak</strong></p>
    <p>Box中还提供了一个非常有用的关联函数:<code>Box::leak</code>，他可以消费掉Box并且强制目标值从内存中泄漏。</p>
    <pre><code class="language-rust">fn gen_static_str() -&gt; &amp;'static str{
    let mut s = String::from(&quot;Hello,&quot;);
    s.push_str(&quot;World&quot;);
    // Box::leak(Box::new(s))
    Box::leak(s.into_boxed_str())
}
</code></pre>
    <p>上面函数中返回的str是真正具有<code>'static</code>生命周期的类型，这就是<code>Box::leak</code>的作用。</p>
    <p>简单来说，当你需要一个在运行期间初始化的值，但是可以全局有效，也就是和整个程序活的一样久，那么就可以使用<code>Box::leak</code></p>
    <h3>17.2 Deref 解引用</h3>
    <p><strong>通过*获取引用背后的值</strong></p>
    <pre><code class="language-rust">fn main(){
    let x = 5;
    let y = &amp;x;
    assert_eq!(x,5);
    assert_eq!(*y ,5);
}
</code></pre>
    <p>我们可以通过<code>*</code>操作符来进行解引用，获取到内存地址对应的数据值。</p>
    <p>如果你视图通过<code>assert_eq!(y,5);</code>来进行比较，编译器就会无情报错，因为你无法将一个引用与一个数值作为比较。</p>
    <p>我们可以仿照Box&lt;T&gt;自己实现一个简易的智能指针</p>
    <pre><code class="language-rust">struct MyBox&lt;T&gt;(T);

impl&lt;T&gt; MyBox&lt;T&gt;{
    fn new(x:T)-&gt;Self{
        MyBox(x)
    }
}
impl&lt;T&gt; Deref for MyBox&lt;T&gt;{
    type Target = T;

    fn deref(&amp;self) -&gt; &amp;Self::Target {
        &amp;self.0
    }
}
fn main(){
    let y = MyBox::new(5);
    assert_eq!(5, *aa);
}
</code></pre>
    <p>在进行<code>*</code>操作时，实际上Rust进行了这样的转换:</p>
    <pre><code class="language-rust">*(y.deref())
</code></pre>
    <h4>17.2.1 函数和方法中的隐式Deref转换</h4>
    <p>对于函数和方法的传参，Rust提供了一个及其有用的隐式转换:Deref转换，若一个类型实现了Deref特征，那他的引用在传给函数或方法时会根据参数签名来决定是否进行隐式的Deref转换，例如:</p>
    <pre><code class="language-rust">fn display(s:&amp;str){
    println!(&quot;{}&quot;,s);
}
fn main(){
    let str = String::from(&quot;Hello&quot;);
    display(&amp;str);
}
</code></pre>
    <ul>
        <li>String实现了Deref特征，可以在需要时自动被转换为<code>&amp;str</code>类型</li>
        <li><code>&amp;s</code>是一个<code>&amp;String</code>类型，当他被传给display函数时，自动通过Deref转换成了<code>&amp;str</code></li>
        <li>必须使用<code>&amp;s</code>的方式来触发<code>Deref</code></li>
    </ul>
    <p>接下来我们使用自定义的智能指针来包装它</p>
    <pre><code class="language-rust">fn main(){
    let str = MyBox::new(String::from(&quot;Hello&quot;));
    display(&amp;str);
}
</code></pre>
    <p>程序依然能够完美的输出:Hello，这是由于Rust提供了连续的隐式转换。</p>
    <p>想想看，加入Rust不提供隐式转换，需要怎么写:</p>
    <pre><code class="language-rust">fn main() {
    let m = MyBox::new(String::from(&quot;Rust&quot;));
    display(&amp;(*m)[..]);
}
</code></pre>
    <p>再来看一下在方法、赋值中自动应用 <code>Deref</code> 的例子：</p>
    <pre><code class="language-rust">fn main() {
    let s = MyBox::new(String::from(&quot;hello, world&quot;));
    let s1: &amp;str = &amp;s;
    let s2: String = s.to_string();
}

</code></pre>
    <p>对于<code>s1</code>编译器通过两次<code>Deref</code>将MyBox&lt;String&gt;转换为了&amp;str，而对于s2，我们在其上直接调用了<code>to_string()</code>方法，即使MyBox根本没有实现该方法，完全是因为编译器对MyBox应用了Deref的结果。
    </p>
    <h4>17.2.2 Deref规则总结</h4>
    <p>对于类似<code>&amp;&amp;&amp;&amp;v</code>形式的引用进行解引用时，Rust会进行<code>引用归一化</code>，具体就是:</p>
    <ul>
        <li>把智能指针(比如在库中定义的Box、Rc、Arc、Cow等)从结构体脱壳为内部的引用类型，也就是转成结构体内部的<code>&amp;v</code></li>
        <li>把多重<code>&amp;</code>，例如<code>&amp;&amp;&amp;&amp;&amp;v</code>归一成<code>&amp;v</code></li>
    </ul>
    <pre><code class="language-rust">fn main(){
    struct Foo;
    impl Foo {
        fn foo(&amp;self) { println!(&quot;Foo&quot;); }
    }

    let f = &amp;&amp;Foo;
    f.foo();
    (&amp;f).foo();
    (&amp;&amp;f).foo();
    (&amp;&amp;&amp;&amp;&amp;&amp;&amp;&amp;f).foo();
}
</code></pre>
    <h4>17.2.3 三种Deref转换</h4>
    <ul>
        <li>当<code>T: Deref&lt;Target=U&gt;</code>，可以将<code>&amp;T</code>转换成<code>&amp;U</code>，也就是我们之前看到的例子</li>
        <li>当<code>T: DerefMut&lt;Target=U&gt;</code>，可以将<code>&amp;mut T</code>转换成<code>&amp;mut U</code>。</li>
        <li>当<code>T: Deref&lt;Target=U&gt;</code>，可以将<code>&amp;mut T</code>转换成<code>&amp;U</code>。</li>
    </ul>
    <pre><code class="language-rust">struct MyBox&lt;T&gt; {
    v: T,
}

impl&lt;T&gt; MyBox&lt;T&gt; {
    fn new(x: T) -&gt; MyBox&lt;T&gt; {
        MyBox { v: x }
    }
}

use std::ops::Deref;

impl&lt;T&gt; Deref for MyBox&lt;T&gt; {
    type Target = T;

    fn deref(&amp;self) -&gt; &amp;Self::Target {
        &amp;self.v
    }
}

use std::ops::DerefMut;

impl&lt;T&gt; DerefMut for MyBox&lt;T&gt; {
    fn deref_mut(&amp;mut self) -&gt; &amp;mut Self::Target {
        &amp;mut self.v
    }
}

fn main() {
    let mut s = MyBox::new(String::from(&quot;hello, &quot;));
    display(&amp;mut s)
}

fn display(s: &amp;mut String) {
    s.push_str(&quot;world&quot;);
    println!(&quot;{}&quot;, s);
}
</code></pre>
    <p>需要注意:</p>
    <ul>
        <li>要实现<code>DerefMut</code>必须要先实现<code>Deref</code>特征</li>
    </ul>
    <h3>17.3 Drop释放资源</h3>
    <h4>17.3.1 Drop的顺序</h4>
    <pre><code class="language-rust">struct HasDrop1;
struct HasDrop2;
impl Drop for HasDrop1 {
    fn drop(&amp;mut self) {
        println!(&quot;Dropping HasDrop1!&quot;);
    }
}
impl Drop for HasDrop2 {
    fn drop(&amp;mut self) {
        println!(&quot;Dropping HasDrop2!&quot;);
    }
}
struct HasTwoDrops {
    one: HasDrop1,
    two: HasDrop2,
}
impl Drop for HasTwoDrops {
    fn drop(&amp;mut self) {
        println!(&quot;Dropping HasTwoDrops!&quot;);
    }
}

struct Foo;

impl Drop for Foo {
    fn drop(&amp;mut self) {
        println!(&quot;Dropping Foo!&quot;)
    }
}

fn main() {
    let _x = HasTwoDrops {
        two: HasDrop2,
        one: HasDrop1,
    };
    let _foo = Foo;
    println!(&quot;Running!&quot;);
}
</code></pre>
    <p>从这段代码可以看出Rust执行drop的顺序的结论</p>
    <ul>
        <li>变量级别，按照逆序的方式，<code>_x</code>在<code>_foo</code>之前创建，因此<code>_x</code>在<code>_foo</code>之后被<code>drop</code></li>
        <li>结构体内部，按照顺序的方式，结构体<code>_x</code>中的字段按照定义中的顺序依次<code>drop</code></li>
    </ul>
    <h4>17.3.2 手动回收</h4>
    <p>在使用智能指针来管理锁的时候，你可能希望提前释放这个锁，然后让其他代码能及时获取锁，此时就需要提前去手动drop。</p>
    <p>但是对于Rust而言，不允许我们手动的调用析构函数，他会提示你使用<code>drop</code>函数</p>
    <p>下面是标准库的drop函数的实现</p>
    <pre><code class="language-rust">pub fn drop&lt;T&gt;(_x: T) {}
</code></pre>
    <p>只有短短一行代码，实际上他做的就是获取你的所有权，然后什么都不做，在函数结束的时候释放持有的所有权的对象。</p>
    <h4>17.3.3 互斥的Copy和Drop</h4>
    <p>我们无法为同一个类型实现Copy和Drop，因为实现了Copy特征的类型会被编译器隐性的复制，因此非常难以预测析构函数执行的时间可频率。</p>
    <h3>17.4 Rc 和 Arc</h3>
    <p>Rust的所有权机制要求，一个值只能有一个所有者，在大多数情况下，都没有问题，但是:</p>
    <ul>
        <li>在图数据结构中，多个边可能会拥有同一个节点，该节点直到没有边指向它时，才应该被释放清理。</li>
        <li>在多线程中，多个线程可能会持有同一个数据，但是受限于Rust的安全机制，你无法同时获取该数据的可变引用。</li>
    </ul>
    <p>为了将解决这样的问题，Rust引用了<code>Rc</code>和<code>Arc</code>，前者适用于单线程，后者适用于多线程。</p>
    <h4>17.4.1 Rc&lt;T&gt;</h4>
    <p>Rc其实指<code>Reference Counting</code>为引用计数器。</p>
    <p>通过记录一个数据被引用的次数来确定该数据是否正在被使用，当计数为零时，该代表该数据不在被使用，因此可以被清理释放。</p>
    <p>在Rust中，<strong>当我们希望在堆上分配一个对象供程序的多个部分使用且无法确定哪个部分最后一个结束时，就可以使用Rc成为数据值的所有者。</strong></p>
    <pre><code class="language-rust">fn main() {
    let a = Box::new(String::from(&quot;Hello,World&quot;));
    let b = Box::new(a);
    // error: used of moved value a
    let c = Box::new(a);
}
</code></pre>
    <p>这时使用<code>Rc</code>可以解决</p>
    <pre><code class="language-rust">fn main(){
    let mut a = Rc::new(String::from(&quot;Hello,World&quot;));
    let b = Rc::clone(&amp;a);

    assert_eq!(2, Rc::strong_count(&amp;a));
    assert_eq!(Rc::strong_count(&amp;a), Rc::strong_count(&amp;b));
}
</code></pre>
    <p>Rc在创建时，会将引用计数<code>+1</code>，此时调用<code>Rc::strong_count()</code>获取的值将是1</p>
    <p>接着，调用了<code>Rc::clone()</code>方法进行克隆指针，需要注意的是:**这里的<code>clone</code>仅仅只是复制了智能指针并增加了引用计数，并没有克隆底层数据。**因此这里的<code>a</code>和<code>b</code>是共享了底层的字符串。
    </p>
    <p>实际上在Rust中，还有不少clone都是浅拷贝，例如迭代器的克隆。</p>
    <p><strong>Rc::strong_count()</strong></p>
    <pre><code class="language-rust">    let a = Rc::new(String::from(&quot;Hello,World&quot;));
    println!(&quot;1:{}&quot;, Rc::strong_count(&amp;a)); // 1
    let b = Rc::clone(&amp;a);
    println!(&quot;2:{}&quot;, Rc::strong_count(&amp;a)); // 2
    {
        let c = Rc::clone(&amp;a);
        println!(&quot;3:{}&quot;,Rc::strong_count(&amp;a));  // 3
    }
    println!(&quot;4:{}&quot;,Rc::strong_count(&amp;a));  // 2

</code></pre>
    <p>Rc的计数器会随着变量的声明、释放而变化。</p>
    <p>最后，当<code>a</code>、<code>b</code>超出作用域后，引用计数器会归零，最终智能指针和它指向的底层字符串都会被释放。</p>
    <p><strong>Rc&lt;T&gt;是不可变引用</strong></p>
    <p>由于Rc&lt;T&gt;是指向底层数据的不可变引用，因此你无法通过它直接修改数据，但是你可以通过<code>RefCell</code>结合进行修改，这时所有拥有者手上的数据都会修改。</p>
    <p>例如，有很多小工具，每个工具都有自己的主人，但是存在多个工具属于同一个主人的情况，此时使用 <code>Rc&lt;T&gt;</code> 就非常适合：</p>
    <pre><code class="language-rust">struct Owner{
    name: String,
}

struct Gadget{
    id: i32,
    owner: Rc&lt;Owner&gt;,
}


fn main(){
    let gadget_owner = Rc::new(Owner{
        name: String::from(&quot;ryu2u&quot;),
    });
    let gadget1 = Gadget {
        id: 1,
        owner: Rc::clone(&amp;gadget_owner),
    };
    let gadget2 = Gadget {
        id: 2,
        owner: Rc::clone(&amp;gadget_owner),
    };
    println!(&quot;the strong_count is {}&quot;, Rc::strong_count(&amp;gadget_owner)); // 3
    // 释放第一个引用
    drop(gadget_owner); // 这里我们实际上释放掉的是存在栈上的指针，而不是Rc指向的堆中数据
    println!(&quot;the strong_count after drop is {}&quot;, Rc::strong_count(&amp;gadget1.owner)); // 2
    println!(&quot;the strong_count after drop is {}&quot;, Rc::strong_count(&amp;gadget2.owner)); // 2
}
</code></pre>
    <p><strong>总结</strong></p>
    <ul>
        <li><code>Rc/Arc</code>是不可变引用，你无法修改它指向的值，只能进行读取，如果要修改，需要配合内部可变性<code>RefCell</code>或互斥锁<code>Mutex</code></li>
        <li>一旦最后一个拥有者消失，则资源会自动被回收，这个生命周期是在编译器就确定下来的</li>
        <li><code>Rc</code>只能用于统一线程内部，想要用于线程之间的对象共享，你需要使用<code>Arc</code></li>
        <li><code>Rc&lt;T&gt;</code>是一个智能指针，实现了<code>Deref</code>特征，因此你无需解开Rc指针再使用里面的T。</li>
    </ul>
    <p>Rc不能在多线程之间传递的表面原因是没有实现Send特征，但是，他还有更深层的原因:由于Rc&lt;T&gt;需要管理引用计数，但是该计数器并没有使用任何并发原语，因此无法实现原子化的技术操作。</p>
    <h4>17.4.2 Arc</h4>
    <p><code>Arc</code>是<code>Automic Rc</code>的缩写，及原子化的<code>Rc</code>，他保证了其中的数据能够在线程之间共享。</p>
    <p>例如:</p>
    <pre><code class="language-rust">    let a = Arc::new(String::from(&quot;多线程&quot;));
    for _ in 0..4 {
        let s = Arc::clone(&amp;a);
        let handle = thread::spawn(move || {
            println!(&quot;{}&quot;,s);
        });
    }
</code></pre>
    <p>上面这段代码，使用<code>Rc</code>无法编译，但是<code>Arc</code>可以通过。</p>
    <h3>17.5 Cell 和 RefCell</h3>
    <p>Rust提供了<code>Cell</code>和<code>RefCell</code>用于内部可变性，可以在拥有多个不可变引用的同时修改目标数据，对于正常的代码来说，这个是不可能做到的(要么一个可变借用，要么多个不可变借用)。</p>
    <h4>17.5.1 Cell</h4>
    <pre><code class="language-rust">    let c = Cell::new(&quot;asdf&quot;);
    let one = c.get();
    c.set(&quot;jkl;&quot;);
    let two =  c.get();
    println!(&quot;{}&quot;,one); // asdf
    println!(&quot;{}&quot;,two); // jkl;
</code></pre>
    <p>这里我们将c的数据保存起来，再修改它的值再继续保存起来，这违背的Rust的借用规则，但是我们使用Cell做到了这一点。</p>
    <p>但是Cell只能够存放实现了<code>Copy</code>特征的对象，例如，你无法使用Cell存放String数据，因为它没有实现Copy特征</p>
    <p><code>let c = Cell::new(String::from(&quot;asdf&quot;)); // error</code></p>
    <pre><code class="language-rust">    let x = Cell::new(1);
    let y = &amp;x;
    let z = &amp;x;
    y.set(2);
    println!(&quot;{}&quot;,y.get());  // 2
    println!(&quot;{}&quot;, x.get()); // 2

    z.set(4);
    println!(&quot;{}&quot;, y.get());  // 4
    println!(&quot;{}&quot;,x.get());   // 4
</code></pre>
    <h4>17.5.2 RefCell</h4>
    <p>Rust中所有权和借用规则与智能指针的对比:</p>
    <p>| Rust规则 | 智能指针带来的额外规则 |
        | ------------------------------------ | ---------------------------------- |
        | 一个数据只能有一个所有者 | Rc/Arc让一个数据可以拥有多个所有者 |
        | 要么多个不可变借用，要么一个可变借用 | RefCell实现编译器可变、不可变共存 |
        | 违背规则导致编译错误 | 违背规则导致运行时panic |</p>
    <blockquote>
        <p>实际上，<code>RefCell</code>并没有解决可变引用和不可变引用共存的问题，而是让编译器放他一马，将错误推迟到运行时panic。</p>
    </blockquote>
    <p>例如:</p>
    <pre><code class="language-rust">    let s = RefCell::new(String::from(&quot;ccc&quot;));
    let s1 = s.borrow();
    let s2 = s.borrow_mut();
</code></pre>
    <p>上面这段代码可以通过编译器，但无法运行，他会在运行时直接panic结束程序。</p>
    <pre><code class="language-rust">thread 'main' panicked at 'already borrowed: BorrowMutError', src\\main.rs:90:16
error: process didn't exit successfully: \`target\\debug\\ch17_Rc_Arc.exe\` (exit code: 101)
</code></pre>
    <p>总之，当你确信编译器报错但不知如何解决时，或者你有一个引用类型，需要被四处使用和修改然后导致借用关系难以管理时，都可以有限考虑使用<code>RefCell</code></p>
    <p><strong>总结</strong></p>
    <ul>
        <li><code>Cell</code>只能用于实现了Copy的类型，<code>RefCell</code>用于引用</li>
        <li><code>RefCell</code>只是将借用规则从编译期推迟到程序运行时，并不能让你绕过Rust的借用规则</li>
        <li>使用<code>RefCell</code>时，<code>违背规则</code>仍然会导致panic，而Cell则不会导致panic</li>
    </ul>
    <p><strong>RefCell的内部可变性</strong></p>
    <p>我们希望实现一个异步消息队列，先将消息写入缓存再由缓存批量发送出去:</p>
    <pre><code class="language-rust">// 外部库中的特征，不能修改
pub trait Messenger{
    fn send(&amp;self,msg:String);
}

// 本地定义的结构体
struct MsgQueue{
    msg_cache: Vec&lt;String&gt;,
}

impl Messenger for MsgQueue{
    fn send(&amp;self, msg: String) {
        self.msg_cache.push(msg); // error，cannot be borrowed as mutable
    }
}
</code></pre>
    <p>这是，我们可以使用RefCell将它包装起来，使self中的msg_cache可变</p>
    <pre><code class="language-rust">struct MsgQueue{
    msg_cache: RefCell&lt;Vec&lt;String&gt;&gt;,
}

impl Messenger for MsgQueue{
    fn send(&amp;self, msg: String) {
        self.msg_cache.borrow_mut().push(msg);
    }
}
</code></pre>
    <h4>17.5.3 Rc + RefCell组合</h4>
    <pre><code class="language-rust">    let a = Rc::new(
        RefCell::new(
            String::from(&quot;这是一个工具，可以有多个所有者&quot;)
        )
    );
    let b = a.clone();
    let c = Rc::clone(&amp;a);
    c.borrow_mut().push_str(&quot;aaaa&quot;);
    println!(&quot;{:?}&quot;,c);
    println!(&quot;{:?}&quot;,b);
    println!(&quot;{:?}&quot;,a);
</code></pre>
    <p><strong><code>由于Rc的所有者们共享同一个底层数据，因此当一个所有者更改了数据时，所有的持有者的数据都会修改。</code></strong></p>
    <p>所以这里的abc输出都为:</p>
    <pre><code class="language-rust">RefCell { value: &quot;这是一个工具，可以有多个所有者aaaa&quot; }
</code></pre>
    <h4>17.6 Cow智能指针</h4>
    <p>Cow是Rust中的一个特殊类型，全称为<code>Clone-On-Write</code>即在写入时进行克隆操作，Cow类型可以用来避免不必要的内存分配和复制操作，从而提高程序的性能和效率。</p>
    <p>Cow类型有两种形式:</p>
    <ul>
        <li><code>Cow::Borrowed(&amp;'a T)</code>表示一个不可变的引用，可以用于读取数据</li>
        <li><code>Cow::Owned(T)</code>表示一个可变的数据，可以用于修改数据。</li>
    </ul>
    <p>Cow类型的克隆操作是惰性的，只有在修改数据时才会进行克隆操作，这种惰性的克隆操作可以避免不必要的内存分配和赋值操作。</p>
    <h2>十八、循环引用与自引用</h2>
    <h4>18.1 Weak 与 循环引用</h4>
    <p>这是一段这循环引用造成Rust内存泄漏的代码</p>
    <pre><code class="language-rust">use crate::List::{Cons, Nil};

#[derive(Debug)]
enum List {
    Cons(i32, RefCell&lt;Rc&lt;List&gt;&gt;),
    Nil,
}

impl List {
    fn tail(&amp;self) -&gt; Option&lt;&amp;RefCell&lt;Rc&lt;List&gt;&gt;&gt; {
        match self {
            Cons(_, item) =&gt; Some(item),
            Nil =&gt; None,
        }
    }
}

fn main(){
    let a = Rc::new(Cons(5, RefCell::new(Rc::new(Nil))));

    println!(&quot;a的初始化rc计数 = {}&quot;, Rc::strong_count(&amp;a));
    println!(&quot;a指向的节点 = {:?}&quot;, a.tail());

    // 创建\`b\`到\`a\`的引用
    let b = Rc::new(Cons(10, RefCell::new(Rc::clone(&amp;a))));

    println!(&quot;在b创建后，a的rc计数 = {}&quot;, Rc::strong_count(&amp;a));
    println!(&quot;b的初始化rc计数 = {}&quot;, Rc::strong_count(&amp;b));
    println!(&quot;b指向的节点 = {:?}&quot;, b.tail());

    // 利用RefCell的可变性，创建了\`a\`到\`b\`的引用
    if let Some(link) = a.tail() {
        *link.borrow_mut() = Rc::clone(&amp;b);
    }

    println!(&quot;在更改a后，b的rc计数 = {}&quot;, Rc::strong_count(&amp;b));
    println!(&quot;在更改a后，a的rc计数 = {}&quot;, Rc::strong_count(&amp;a));

    // 危!
    // 下面一行println!将导致循环引用
    // 我们可怜的8MB大小的main线程栈空间将被它冲垮，最终造成栈溢出
    // println!(&quot;a next item = {:?}&quot;, a.tail());
}
</code></pre>
    <p>最后一行，编译器视图打印出<code>a-&gt;b-&gt;a-&gt;b-&gt;a...</code>的循环引用，最终造成oom溢出</p>
    <p><strong>Week弱引用</strong></p>
    <pre><code class="language-rust">use std::rc::Rc;
fn main() {
    // 创建Rc，持有一个值5
    let five = Rc::new(5);

    // 通过Rc，创建一个Weak指针
    let weak_five = Rc::downgrade(&amp;five);

    // Weak引用的资源依然存在，取到值5
    let strong_five: Option&lt;Rc&lt;_&gt;&gt; = weak_five.upgrade();
    assert_eq!(*strong_five.unwrap(), 5);

    // 手动释放资源\`five\`
    drop(five);

    // Weak引用的资源已不存在，因此返回None
    let strong_five: Option&lt;Rc&lt;_&gt;&gt; = weak_five.upgrade();
    assert_eq!(strong_five, None);
}

</code></pre>
    <p><strong>使用Week解决循环引用</strong></p>
    <pre><code class="language-rust">use std::rc::Rc;
use std::rc::Weak;
use std::cell::RefCell;

// 主人
struct Owner {
    name: String,
    gadgets: RefCell&lt;Vec&lt;Weak&lt;Gadget&gt;&gt;&gt;,
}

// 工具
struct Gadget {
    id: i32,
    owner: Rc&lt;Owner&gt;,
}

fn main() {
    // 创建一个 Owner
    // 需要注意，该 Owner 也拥有多个 \`gadgets\`
    let gadget_owner : Rc&lt;Owner&gt; = Rc::new(
        Owner {
            name: &quot;Gadget Man&quot;.to_string(),
            gadgets: RefCell::new(Vec::new()),
        }
    );

    // 创建工具，同时与主人进行关联：创建两个 gadget，他们分别持有 gadget_owner 的一个引用。
    let gadget1 = Rc::new(Gadget{id: 1, owner: gadget_owner.clone()});
    let gadget2 = Rc::new(Gadget{id: 2, owner: gadget_owner.clone()});

    // 为主人更新它所拥有的工具
    // 因为之前使用了 \`Rc\`，现在必须要使用 \`Weak\`，否则就会循环引用
    gadget_owner.gadgets.borrow_mut().push(Rc::downgrade(&amp;gadget1));
    gadget_owner.gadgets.borrow_mut().push(Rc::downgrade(&amp;gadget2));

    // 遍历 gadget_owner 的 gadgets 字段
    for gadget_opt in gadget_owner.gadgets.borrow().iter() {

        // gadget_opt 是一个 Weak&lt;Gadget&gt; 。 因为 weak 指针不能保证他所引用的对象
        // 仍然存在。所以我们需要显式的调用 upgrade() 来通过其返回值(Option&lt;_&gt;)来判
        // 断其所指向的对象是否存在。
        // 当然，Option 为 None 的时候这个引用原对象就不存在了。
        let gadget = gadget_opt.upgrade().unwrap();
        println!(&quot;Gadget {} owned by {}&quot;, gadget.id, gadget.owner.name);
    }

    // 在 main 函数的最后，gadget_owner，gadget1 和 gadget2 都被销毁。
    // 具体是，因为这几个结构体之间没有了强引用（\`Rc&lt;T&gt;\`），所以，当他们销毁的时候。
    // 首先 gadget2 和 gadget1 被销毁。
    // 然后因为 gadget_owner 的引用数量为 0，所以这个对象可以被销毁了。
    // 循环引用问题也就避免了
}

</code></pre>
    <h4>18.2 结构体中的自引用</h4>
    <h2>十九、全局变量</h2>
    <p>全局变量的生命周期一定是<code>'static</code></p>
    <p><strong>简单来说，全局变量可以分为两种</strong>:</p>
    <ul>
        <li><strong>编译期间初始化的全局变量，<code>const</code>创建常量，<code>static</code>创建静态变量，<code>Atomic</code>创建原子类</strong>。</li>
        <li><strong>运行期初始化的变量，<code>lazy_static</code>用于懒初始化，<code>Box::leak</code>利用内存泄漏将一个变量的生命周期变为<code>'static</code></strong>。</li>
    </ul>
    <h3>19.1 静态常量</h3>
    <p>全局常量可以在程序任何一部分使用，当然，如果它是定义在某个模块中，你需要引入对应的模块才能使用。</p>
    <pre><code class="language-rust">const MAX_ID:usize = usize::MAX/2;
fn main(){
    println!(&quot;用户允许的最大ID为:{}&quot;, MAX_ID);
}
</code></pre>
    <p>常量与普通变量的区别:</p>
    <ul>
        <li>关键字是<code>const</code>而不是<code>let</code></li>
        <li>定义常量必须指明类型，不能省略</li>
        <li>常量可以在任意作用域进行定义，其生命周期贯穿整个程序的生命周期。编译时编译器会尽可能将其内联到代码中，所以在不同地方对同一常量的引用并不能保证引用到相同的内存地址。</li>
        <li>常量的赋值只能是常量表达式/数学表达式，也就是说必须是在编译器就能计算出的值，如果需要在运行时才能得出结果的值，比如说函数则不能赋值给常量表达式</li>
        <li>对于变量出现重复的定义，会发生变量遮盖，后面定义的变量会遮住前面定义的变量，常量则不允许出现重复的定义。</li>
    </ul>
    <h3>19.2 静态变量</h3>
    <p>静态变量允许声明一个全局的变量，用于全局数据统计，例如，我们希望用一个变量来统计程序当前的总请求数</p>
    <pre><code class="language-rust">static mut \tREQUEST_RECV:usize = 0;
fn main(){
    unsafe{
        REQUEST_RECV += 1;
        assert_eq!(REQUEST_RECV, 1);
    }
}
</code></pre>
    <blockquote>
        <p>Rust要求必须使用unsafe语句块才能修改静态变量，因为这种使用方式往往并不安全。</p>
    </blockquote>
    <p><strong>静态变量和常量的区别:</strong></p>
    <ul>
        <li>静态变量不会被内联，在整个程序中，静态变量只有一个实例，所有的引用都会指向同一个地址</li>
        <li>存储在静态变量中的值必须要实现<code>Sync trait</code></li>
    </ul>
    <h3>19.3 原子类型</h3>
    <p>想要全局计数器，状态控制等功能，有想要线程安全的实现，原子类型是非常好的办法。</p>
    <pre><code class="language-rust">static REQUEST_RECV: AtomicUsize = AtomicUsize::new(0);

// 原子类型
#[test]
fn test_atomic_usize() {
    let mut v = vec![];
    for _ in 0..1000 {
        v.push(thread::spawn(move || {
            REQUEST_RECV.fetch_add(1, Ordering::Relaxed);
        }));
    }
    for handle in v.into_iter() {
        handle.join().unwrap();
    }
    println!(&quot;{}&quot;, REQUEST_RECV.load(Ordering::Relaxed));
}
</code></pre>
    <h3>19.4 运行期初始化</h3>
    <p>以上的静态初始化有一个致命的问题:无法使用函数进行初始化，例如你如果想声明一个全局的Mutex锁:</p>
    <pre><code class="language-rust">static NAMES:Mutex&lt;String&gt; = Mutex::new(String::from(&quot;ryu2u&quot;));
</code></pre>
    <p>编译会直接报错</p>
    <pre><code class="language-rust">error[E0015]: cannot call non-const fn \`&lt;String as From&lt;&amp;str&gt;&gt;::from\` in statics
 --&gt; src\\main.rs:9:41
  |
9 | static NAMES:Mutex&lt;String&gt; = Mutex::new(String::from(&quot;ryu2u&quot;));
  |                                         ^^^^^^^^^^^^^^^^^^^^^
</code></pre>
    <p>你又必须在声明时就对NAMES初始化，此时就陷入了两难的境地，这时，我们可以使用<code>lazy_static</code>包来解决问题</p>
    <h4>19.4.1 lazy_static</h4>
    <p><code>lazy_static</code>是社区提供的非常强大的宏，用于懒初始化加载静态变量，之前的静态变量都是在编译器初始化的，因此无法使用函数调用的方式进行赋值，而<code>lazy_static</code>允许我们在运行期间初始化静态变量。
    </p>
    <p>这时，你只要给NAMES加上<code>lazy_static</code>宏就可以解决问题。</p>
    <pre><code class="language-rust">lazy_static!{
    static ref NAMES:Mutex&lt;String&gt; = Mutex::new(String::from(&quot;ryu2u&quot;));
}
</code></pre>
    <blockquote>
        <p>需要注意的是:使用<code>lazy_static</code>在每次访问静态变量时，会有轻微的性能损失，因为其内部实现用了一个底层的并发原语<code>std::sync::Once</code>，在每次访问该变量时，程序都会执行一次原子指令用于确认静态变量的初始化是否完成。
        </p>
        <p><code>lazy_static</code>宏，匹配的是<code>static ref</code>所以定义的静态变量都是不可变引用。</p>
    </blockquote>
    <p><strong>一个全局的动态配置，它在程序开始后，才加载数据进行初始化，最终可以让各个线程直接访问使用</strong></p>
    <p>这是一个使用lazy_static实现全局缓存的例子</p>
    <pre><code class="language-rust">lazy_static! {
    static ref CACHED:HashMap&lt;u32,&amp;'static str&gt; = {
        let mut map = HashMap::new();
        map.insert(0,&quot;foo&quot;);
        map.insert(1,&quot;java&quot;);
        map.insert(2,&quot;html&quot;);
        map
    };
}

fn main() {
    // 首次访问CACHED的同时对其初始化
    println!(&quot;the value in index 0 this : {}&quot;, CACHED.get(&amp;0).unwrap());
    // 后续对CACHED的访问仅仅获取值，而不会进行任何初始化
    println!(&quot;the value in index 1 this : {}&quot;, CACHED.get(&amp;1).unwrap());
}
</code></pre>
    <h4>19.4.2 Box::leak</h4>
    <p><code>Box::leak</code>可以使用于全局变量，例如用作运行期初始化的全局动态配置，先来看看如果不使用<code>lazy_static</code>,也不使用<code>Box::leak</code>时，会发生什么?</p>
    <pre><code class="language-rust">static mut CONFIG:Option&lt;&amp;mut Config&gt; = None;

fn main(){
    unsafe{
        CONFIG = Some(&amp;mut Config{
            a : &quot;A&quot;.to_string(),
            b : &quot;B&quot;.to_string(),
        });
    }
}
</code></pre>
    <p>编译时，会发生</p>
    <pre><code class="language-rust">error[E0716]: temporary value dropped while borrowed
  --&gt; src\\main.rs:41:28
   |
41 |            CONFIG = Some(&amp;mut Config{
   |   _________-__________________^
   |  |_________|
   | ||
42 | ||             a : &quot;A&quot;.to_string(),
43 | ||             b : &quot;B&quot;.to_string(),
44 | ||         });
   | ||         ^-- temporary value is freed at the end of this statement
   | ||_________||
   |  |_________|assignment requires that borrow lasts for \`'static\`
   |            creates a temporary which is freed while still in use
</code></pre>
    <p>这是由于，Rust的借用和生命周期规则限制了我们做到这一点，因为视图将一个局部生命周期的变量赋值给全局生命周期的变量，这明显是不安全的。</p>
    <p>但是，<code>Box::leak</code>可以为我们做到这一点，他可以将一个变量从内存中泄漏，然后将其变为<code>'static</code>生命周期，最终该变量将和程序获得一样久，因此可以赋值给全局变量。</p>
    <pre><code class="language-rust">fn main(){
    let config = Box::new(Config{
        a : &quot;A&quot;.to_string(),
        b : &quot;B&quot;.to_string(),
    });

    unsafe{
        // 将config从内存中泄漏，变成'static 生命周期
        CONFIG = Some(Box::leak(config));
    }
}
</code></pre>
    <h4>19.4.3 从函数中返回全局变量</h4>
    <pre><code class="language-rust">#[derive(Debug)]
struct Config{
    a: String,
    b: String,
}

static mut CONFIG:Option&lt;&amp;mut Config&gt; = None;

fn init() -&gt; Option&lt;&amp;'static mut Config&gt;{
    let c = Box::new(Config{
        a : &quot;A&quot;.to_string(),
        b : &quot;B&quot;.to_string(),
    });
    Some(Box::leak(c))
}

fn main() {
    unsafe{
        CONFIG = init();
        println!(&quot;{:?}&quot;,CONFIG);
    }
}
</code></pre>
    <h4>19.4.4 标准库中的OnceCell</h4>
    <p>
        在<code>Rust</code>标准库中提供了实验性的<code>lazy::OnceCell</code>和<code>lazy_SyncOnceCell</code>(在<code>Rust</code>1.70.0版本及以上的标准库中，替换为稳定的<code>cell::OnceCell</code>和<code>sync::OnceLock</code>)两种<code>Cell</code>，前者用于单线程，后者用于多线程，他们用来存储堆上的信息，并且具有最多只能赋值一次的特性。如实现一个多线程的日志组件<code>Logger</code>
    </p>
    <pre><code class="language-rust">#![feature(once_cell)]

use std::{lazy::SyncOnceCell, thread};

fn main() {
    // 子线程中调用
    let handle = thread::spawn(|| {
        let logger = Logger::global();
        logger.log(&quot;thread message&quot;.to_string());
    });

    // 主线程调用
    let logger = Logger::global();
    logger.log(&quot;some message&quot;.to_string());

    let logger2 = Logger::global();
    logger2.log(&quot;other message&quot;.to_string());

    handle.join().unwrap();
}

#[derive(Debug)]
struct Logger;

static LOGGER: SyncOnceCell&lt;Logger&gt; = SyncOnceCell::new();

impl Logger {
    fn global() -&gt; &amp;'static Logger {
        // 获取或初始化 Logger
        LOGGER.get_or_init(|| {
            println!(&quot;Logger is being created...&quot;); // 初始化打印
            Logger
        })
    }

    fn log(&amp;self, message: String) {
        println!(&quot;{}&quot;, message)
    }
}

</code></pre>
    <h2>二十、unsafe</h2>
    <p><code>unsafe</code>的5种作用:</p>
    <ul>
        <li>解引用裸指针</li>
        <li>调用一个<code>unsafe</code>或外部的函数</li>
        <li>访问或修改一个可变的静态变量</li>
        <li>实现一个<code>unsafe</code>特征</li>
        <li>访问<code>union</code>中的字段</li>
    </ul>
    <h3>20.1 解引用裸指针</h3>
    <p>裸指针与引用不同，他长这样:<code>*const T</code>或者<code>*mut T</code>,分别代表了不可变和可变。</p>
    <p>裸指针的作用:</p>
    <ul>
        <li>可以绕过Rust的借用规则，可以同时拥有一个数据的可变、不可变指针，甚至还能拥有多个可变的指针</li>
        <li>并不能保证指向合法的内存</li>
        <li>可以是null</li>
        <li>没有实现任何自动的回收(drop)</li>
    </ul>
    <p><strong>基于引用创建裸指针</strong></p>
    <pre><code class="language-rust">// pointer
#[test]
fn test_pointer(){
    let mut num = 12;
    let r1 = &amp;num as *const i32;
    let r2 = &amp;mut num as *mut i32;
    println!(&quot;{:?}&quot;, r1);
}
</code></pre>
    <p>只是创建裸指针并不需要使用<code>unsafe</code>代码块，这是因为:<strong>创建裸指针是安全的行为，解引用裸指针才是不安全的行为</strong>。</p>
    <pre><code class="language-rust">// pointer
#[test]
fn test_pointer(){
    let mut num = 12;
    let r1 = &amp;num as *const i32;
    let r2 = &amp;mut num as *mut i32;
    unsafe {
        println!(&quot;{}&quot;, *r1); // 12
        *r2 += 1;
        println!(&quot;{}&quot;, *r2); // 13
        println!(&quot;{}&quot;, *r1); // 13
    }
}
</code></pre>
    <p><strong>使用智能指针来创建裸指针</strong></p>
    <pre><code class="language-rust">// 使用智能指针创建裸指针
#[test]
fn test_box_pointer(){
    let a = Box::new(0);
    let c = Box::into_raw(a);
    unsafe{
        println!(&quot;{:?}&quot;, *c);
    }
}
</code></pre>
</article>
`


    return (
        <>
            <div dangerouslySetInnerHTML={{
                __html: html
            }}>

            </div>
        </>
    );
}