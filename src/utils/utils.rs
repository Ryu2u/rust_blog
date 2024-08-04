use std::time::SystemTime;
use pulldown_cmark::{Options};


pub fn md_to_html(str: &str) -> String {
    let time = SystemTime::now();
    let parser = pulldown_cmark::Parser::new_ext(str, Options::all());
    // Write to a new String buffer.
    let mut html_output = String::new();
    pulldown_cmark::html::push_html(&mut html_output, parser);
    let i = time.elapsed().unwrap().as_micros();
    println!("pull_md cost: {}", i);
    println!("{}", html_output);
    html_output
}


/// 将name 转换为合格的字符串，没有空格，以下划线替换
pub fn parse_slug(name: &str) -> String {
    let name = name.trim();
    name.replace(' ', "_")
}