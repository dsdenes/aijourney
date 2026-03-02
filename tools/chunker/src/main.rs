use serde::{Deserialize, Serialize};
use std::io::{self, Read};

/// Input: a JSON document with `id`, `text`, and optional config.
#[derive(Deserialize)]
struct ChunkRequest {
    /// Unique document identifier (carried through to output chunks).
    id: String,
    /// The full text to chunk.
    text: String,
    /// Target chunk size in characters (default: 1000).
    #[serde(default = "default_chunk_size")]
    chunk_size: usize,
    /// Overlap between consecutive chunks in characters (default: 200).
    #[serde(default = "default_overlap")]
    overlap: usize,
}

fn default_chunk_size() -> usize {
    1000
}
fn default_overlap() -> usize {
    200
}

/// Output: array of chunks with positional metadata.
#[derive(Serialize)]
struct Chunk {
    /// Parent document id.
    doc_id: String,
    /// Zero-based chunk index.
    index: usize,
    /// The chunk text.
    text: String,
    /// Character offset in the original text.
    start: usize,
    /// Character offset end (exclusive).
    end: usize,
}

/// Split text into paragraph-aware, overlapping chunks.
///
/// Strategy:
/// 1. Split into paragraphs (double newline boundaries).
/// 2. Greedily accumulate paragraphs until `chunk_size` is reached.
/// 3. Emit the chunk, then back up by `overlap` characters worth of paragraphs.
///
/// This keeps paragraph boundaries intact so we don't cut mid-sentence.
fn chunk_text(req: &ChunkRequest) -> Vec<Chunk> {
    let text = &req.text;
    if text.is_empty() {
        return vec![];
    }

    // Split into paragraphs, preserving separator positions.
    let paragraphs = split_paragraphs(text);
    if paragraphs.is_empty() {
        return vec![];
    }

    let mut chunks: Vec<Chunk> = Vec::new();
    let mut i = 0; // current paragraph index

    while i < paragraphs.len() {
        let mut current_text = String::new();
        let chunk_start = paragraphs[i].0;
        let mut chunk_end = paragraphs[i].0;
        let mut j = i;

        // Accumulate paragraphs up to chunk_size
        while j < paragraphs.len() {
            let para = &paragraphs[j].1;
            let would_be = if current_text.is_empty() {
                para.len()
            } else {
                current_text.len() + 2 + para.len() // "\n\n" separator
            };

            if !current_text.is_empty() && would_be > req.chunk_size {
                break;
            }

            if !current_text.is_empty() {
                current_text.push_str("\n\n");
            }
            current_text.push_str(para);
            chunk_end = paragraphs[j].0 + paragraphs[j].1.len();
            j += 1;
        }

        chunks.push(Chunk {
            doc_id: req.id.clone(),
            index: chunks.len(),
            text: current_text,
            start: chunk_start,
            end: chunk_end,
        });

        if j >= paragraphs.len() {
            break;
        }

        // Calculate overlap: back up enough paragraphs to cover `overlap` chars
        let mut overlap_chars = 0;
        let mut back = j;
        while back > i + 1 && overlap_chars < req.overlap {
            back -= 1;
            overlap_chars += paragraphs[back].1.len();
        }

        i = back;
    }

    chunks
}

/// Split text into (offset, paragraph_text) pairs.
/// A paragraph boundary is defined as two or more consecutive newlines.
fn split_paragraphs(text: &str) -> Vec<(usize, String)> {
    let mut paragraphs: Vec<(usize, String)> = Vec::new();
    let mut current_start: Option<usize> = None;
    let mut current = String::new();
    let mut consecutive_newlines = 0;
    let mut char_offset = 0;

    for ch in text.chars() {
        let byte_len = ch.len_utf8();
        if ch == '\n' {
            consecutive_newlines += 1;
        } else {
            if consecutive_newlines >= 2 {
                // Paragraph break
                let trimmed = current.trim().to_string();
                if !trimmed.is_empty() {
                    paragraphs.push((current_start.unwrap_or(0), trimmed));
                }
                current.clear();
                current_start = Some(char_offset);
                consecutive_newlines = 0;
            } else if consecutive_newlines == 1 {
                // Single newline → space
                current.push(' ');
                consecutive_newlines = 0;
            }
            if current_start.is_none() {
                current_start = Some(char_offset);
            }
            current.push(ch);
        }
        char_offset += byte_len;
    }

    // Flush last paragraph
    let trimmed = current.trim().to_string();
    if !trimmed.is_empty() {
        paragraphs.push((current_start.unwrap_or(0), trimmed));
    }

    paragraphs
}

fn main() {
    // Read JSON from stdin
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .expect("Failed to read stdin");

    // Support batch mode: if input starts with '[', parse as array
    let requests: Vec<ChunkRequest> = if input.trim_start().starts_with('[') {
        serde_json::from_str(&input).expect("Invalid JSON array input")
    } else {
        let req: ChunkRequest = serde_json::from_str(&input).expect("Invalid JSON input");
        vec![req]
    };

    let mut all_chunks: Vec<Chunk> = Vec::new();
    for req in &requests {
        let mut chunks = chunk_text(req);
        all_chunks.append(&mut chunks);
    }

    // Write JSON to stdout
    let output = serde_json::to_string(&all_chunks).expect("Failed to serialize chunks");
    println!("{}", output);
}
