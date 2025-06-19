import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

interface FileMetadata {
  name: string;
  type: string;
  size: number;
  preview: string;
  path?: string;
  metadata?: Record<string, any>;
  imageData?: string; // Base64 encoded image data for vision analysis
}

interface AnalysisResult {
  originalName: string;
  suggestedName: string;
  confidence: number;
  reasoning: string;
}

// Helper to extract file extension
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot !== -1 ? filename.slice(lastDot) : "";
}

// Helper to sanitize filenames
function sanitizeFilename(filename: string): string {
  // Remove or replace invalid characters
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") // Replace invalid chars with underscore
    .replace(/\.+/g, ".") // Replace multiple dots with single dot
    .replace(/^\./, "") // Remove leading dot
    .replace(/\.$/, "") // Remove trailing dot
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const { files, analyzeFolderStructure = false } = await request.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (!process.env.GROK_API_KEY) {
      console.error("[SmartSync API] Missing GROK_API_KEY");
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 }
      );
    }

    // Initialize OpenAI client with Grok configuration
    const grokApiKey = process.env.GROK_API_KEY;
    console.log(
      "[SmartSync API] Grok API Key present:",
      !!grokApiKey,
      "Key prefix:",
      grokApiKey?.substring(0, 10) + "..."
    );

    const grokClient = new OpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey: grokApiKey,
    });

    // Initialize OpenAI client for image analysis
    const openAIApiKey = process.env.OPEN_AI_API_KEY;
    const openAIClient = openAIApiKey ? new OpenAI({
      apiKey: openAIApiKey,
    }) : null;
    
    if (openAIClient) {
      console.log("[SmartSync API] OpenAI client initialized for image analysis");
    }

    console.log(`[SmartSync API] Processing ${files.length} files`);

    // Dynamically set batch size based on total files
    const BATCH_SIZE = Math.min(
      Math.max(5, Math.floor(files.length / 20)), // At least 5, or 5% of files
      15 // Cap at 15 per batch to avoid API rate limits
    );

    console.log(
      `[SmartSync API] Processing ${files.length} files in batches of ${BATCH_SIZE}`
    );

    // Process files in parallel batches
    const results: AnalysisResult[] = [];

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map((file: FileMetadata) =>
        analyzeFile(file, grokClient, openAIClient)
      );

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (batchError) {
        console.error(`[SmartSync API] Batch error at index ${i}:`, batchError);
        // Continue with next batch even if one fails
        // Fill in failed results with fallback
        for (const file of batch) {
          results.push({
            originalName: file.name,
            suggestedName: file.name,
            confidence: 0,
            reasoning: "Processing failed for this batch",
          });
        }
      }
    }

    // If folder structure analysis is requested, add suggestions
    let folderSuggestions = null;
    if (analyzeFolderStructure && files.length > 10) {
      // Ask Grok for folder organization suggestions
      try {
        const folderPrompt = `Based on these file types and names, suggest an optimal folder structure:
${files
  .slice(0, 20)
  .map((f) => `- ${f.name} (${f.type || "unknown"})`)
  .join("\n")}
${files.length > 20 ? `... and ${files.length - 20} more files` : ""}

Suggest 3-5 main folders with clear, descriptive names. Response in JSON:
{
  "folders": ["folder1", "folder2", ...],
  "reasoning": "Brief explanation"
}`;

        const folderCompletion = await grokClient.chat.completions.create({
          model: "grok-3-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a file organization expert. Suggest clear, logical folder structures. Respond ONLY with valid JSON.",
            },
            {
              role: "user",
              content: folderPrompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 500, // Increased to ensure proper response
        });

        const folderResponseText =
          folderCompletion.choices[0]?.message?.content || "";
        const jsonMatch = folderResponseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          folderSuggestions = JSON.parse(jsonMatch[0]);
        }
      } catch (folderError) {
        console.error("[SmartSync API] Folder analysis error:", folderError);
      }
    }

    return NextResponse.json({ results, folderSuggestions });
  } catch (error) {
    console.error("[SmartSync API] Error:", error);
    return NextResponse.json(
      { error: "Failed to process files" },
      { status: 500 }
    );
  }
}

// Analyze image files using OpenAI GPT-4o-mini
async function analyzeImageWithOpenAI(
  metadata: FileMetadata,
  openAIClient: OpenAI,
  extension: string
): Promise<AnalysisResult> {
  try {
    console.log(`[SmartSync API] Analyzing image with OpenAI: ${metadata.name}`);
    
    // Check if we have actual image data
    if (!metadata.imageData) {
      console.log(`[SmartSync API] No image data available for ${metadata.name}, using metadata only`);
      // Fallback to text-based analysis
      return analyzeImageWithMetadataOnly(metadata, openAIClient, extension);
    }
    
    // Use vision capabilities with actual image
    const messages: any[] = [
      {
        role: "system",
        content: `You are an expert at analyzing images and suggesting descriptive, meaningful filenames. Analyze the visual content and suggest a filename that clearly describes what the image contains. Be specific about objects, people, text, logos, UI elements, or any other visual content. Output ONLY valid JSON.`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this image and suggest a better, more descriptive filename.
Current filename: ${metadata.name}
${metadata.metadata?.isScreenshot ? 'This appears to be a screenshot.' : ''}
${metadata.metadata?.isScan ? 'This appears to be a scanned document.' : ''}

Based on the visual content, suggest a descriptive filename.
Respond with ONLY this JSON format:
{"suggestedName": "descriptive-name${extension}", "confidence": 0.85, "reasoning": "what you see in the image"}`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${metadata.type || 'image/png'};base64,${metadata.imageData}`,
              detail: "auto" // Let OpenAI decide the appropriate detail level
            }
          }
        ]
      }
    ];
    
    const completion = await openAIClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.3,
      max_tokens: 200,
    });

    const responseText = completion.choices[0]?.message?.content || "";
    console.log("[SmartSync API] OpenAI response:", responseText);

    // Log token usage
    if (completion.usage) {
      console.log("[SmartSync API] OpenAI token usage:", {
        prompt_tokens: completion.usage.prompt_tokens,
        completion_tokens: completion.usage.completion_tokens,
        total_tokens: completion.usage.total_tokens
      });
    }

    // Parse the response
    try {
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        // Try to extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in OpenAI response");
        }
        parsed = JSON.parse(jsonMatch[0]);
      }

      if (!parsed.suggestedName) {
        throw new Error("Invalid response format from OpenAI");
      }

      return {
        originalName: metadata.name,
        suggestedName: sanitizeFilename(parsed.suggestedName),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.85)),
        reasoning: parsed.reasoning || "AI suggested name based on image analysis",
      };
    } catch (parseError) {
      console.error("[SmartSync API] Failed to parse OpenAI response:", parseError);
      throw parseError;
    }
  } catch (error) {
    console.error("[SmartSync API] OpenAI image analysis error:", error);
    
    // Fallback to basic image naming
    const imageType = metadata.metadata?.isScreenshot ? 'screenshot' :
                     metadata.metadata?.isScan ? 'scan' :
                     'image';
    const timestamp = new Date().toISOString().split('T')[0];
    
    return {
      originalName: metadata.name,
      suggestedName: `${imageType}-${timestamp}${extension}`,
      confidence: 0.3,
      reasoning: "OpenAI unavailable - basic image naming applied",
    };
  }
}

// Fallback function for analyzing images without actual image data
async function analyzeImageWithMetadataOnly(
  metadata: FileMetadata,
  openAIClient: OpenAI,
  extension: string
): Promise<AnalysisResult> {
  try {
    const completion = await openAIClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a file naming assistant. Based on the limited information available, suggest a better filename. Output ONLY valid JSON.`
        },
        {
          role: "user",
          content: `Suggest a better filename based on this information:
Current filename: ${metadata.name}
File type: ${metadata.type || "image"}
File size: ${(metadata.size / 1024).toFixed(1)}KB
${metadata.preview ? `Metadata: ${metadata.preview}` : ''}

Respond with ONLY this JSON format:
{"suggestedName": "descriptive-name${extension}", "confidence": 0.5, "reasoning": "based on available metadata"}`
        }
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(responseText);
    
    return {
      originalName: metadata.name,
      suggestedName: sanitizeFilename(parsed.suggestedName),
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || "Based on file metadata",
    };
  } catch (error) {
    console.error("[SmartSync API] Metadata-only analysis failed:", error);
    throw error;
  }
}

async function analyzeFile(
  metadata: FileMetadata,
  grokClient: OpenAI,
  openAIClient: OpenAI | null
): Promise<AnalysisResult> {
  const extension = getFileExtension(metadata.name);

  try {
    // Check if this is an image file
    const isImageFile = metadata.type?.startsWith('image/') || 
      metadata.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tiff|tif)$/i);
    
    // Use OpenAI for images if available, otherwise fallback to Grok
    if (isImageFile && openAIClient) {
      return await analyzeImageWithOpenAI(metadata, openAIClient, extension);
    }
    
    // Build context for the AI (Grok)
    const contextParts = [
      `Current filename: ${metadata.name}`,
      `File type: ${metadata.type || "unknown"}`,
      `File size: ${(metadata.size / 1024).toFixed(1)}KB`,
    ];

    if (metadata.preview) {
      contextParts.push(
        `Content preview: ${metadata.preview.substring(0, 500)}`
      );
    }

    if (metadata.path) {
      contextParts.push(`Folder path: ${metadata.path}`);
    }

    // Add extracted metadata if available
    if (metadata.metadata) {
      const meta = metadata.metadata;
      if (meta.category) contextParts.push(`File category: ${meta.category}`);
      if (meta.dateInFilename)
        contextParts.push(`Date found in filename: ${meta.dateInFilename}`);
      if (meta.versionInFilename)
        contextParts.push(
          `Version found in filename: ${meta.versionInFilename}`
        );
      if (meta.isScreenshot)
        contextParts.push(`This appears to be a screenshot`);
      if (meta.isScan)
        contextParts.push(`This appears to be a scanned document`);
      if (meta.isDraft) contextParts.push(`This appears to be a draft`);
      if (meta.isFinal) contextParts.push(`This appears to be a final version`);
    }

    // Call Grok using OpenAI SDK
    let completion;
    try {
      console.log("[SmartSync API] Calling Grok API...");

      // First, let's try a simple test to see if the API is working
      const testCompletion = await grokClient.chat.completions.create({
        model: "grok-3-mini",
        messages: [
          {
            role: "user",
            content: "Say 'test' and nothing else",
          },
        ],
        temperature: 0,
        max_tokens: 10,
      });

      console.log(
        "[SmartSync API] Test response:",
        testCompletion.choices[0]?.message?.content
      );

      // Now make the actual request with increased token limit
      completion = await grokClient.chat.completions.create({
        model: "grok-3-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional file naming assistant who always uses best practices for file naming. You name files based on their content. Please limit the amount of reasoning tokens you use. Analyze the file and suggest a better, more descriptive name. Output ONLY valid JSON with no additional text or explanations.`,
          },
          {
            role: "user",
            content: `Suggest a better name for this file:
Current filename: ${metadata.name}
File type: ${metadata.type || "unknown"}
${
  metadata.preview
    ? `Content preview: ${metadata.preview.substring(0, 200)}`
    : ""
}

Respond with ONLY this JSON format:
{"suggestedName": "descriptive-name${extension}", "confidence": 0.85, "reasoning": "brief explanation"}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1500, // Increased to allow for proper response
      });
    } catch (apiError: any) {
      console.error("[SmartSync API] API call failed:", {
        message: apiError.message,
        status: apiError.status,
        code: apiError.code,
        type: apiError.type,
        response: apiError.response?.data,
      });

      // Check for common errors
      if (apiError.status === 401) {
        throw new Error("Invalid API key - please check your GROK_API_KEY");
      }
      if (apiError.status === 429) {
        throw new Error("Rate limit exceeded - please try again later");
      }

      if (apiError.message?.includes("response_format")) {
        console.log(
          "[SmartSync API] response_format not supported, retrying without it"
        );
        // Retry without response_format
        completion = await grokClient.chat.completions.create({
          model: "grok-3-mini",
          messages: [
            {
              role: "system",
              content: `You are a file naming assistant. Respond ONLY with valid JSON.`,
            },
            {
              role: "user",
              content: `Suggest a better name for this file: ${metadata.name}
Extension to keep: ${extension}

Respond with ONLY this JSON format:
{"suggestedName": "new-name${extension}", "confidence": 0.85, "reasoning": "brief reason"}`,
            },
          ],
          temperature: 0.5,
          max_tokens: 500, // Increased to match main request
        });
      } else {
        throw apiError;
      }
    }

    // Log the full completion object for debugging
    console.log(
      "[SmartSync API] Full completion object:",
      JSON.stringify(completion, null, 2)
    );

    // Parse the response
    const message = completion.choices[0]?.message;
    let responseText = message?.content || "";

    // Log usage information for debugging
    if (completion.usage) {
      console.log("[SmartSync API] Token usage:", {
        prompt_tokens: completion.usage.prompt_tokens,
        completion_tokens: completion.usage.completion_tokens,
        total_tokens: completion.usage.total_tokens,
        // @ts-ignore - Grok may include additional fields
        reasoning_tokens:
          completion.usage.completion_tokens_details?.reasoning_tokens,
      });
    }

    console.log("[SmartSync API] Raw response from Grok:", responseText);

    // Check if we got an empty response
    if (!responseText || responseText.trim() === "") {
      console.error("[SmartSync API] Empty response from Grok");
      throw new Error("Empty response from API");
    }

    try {
      // First try to parse the entire response as JSON
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        // If that fails, try to extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error(
            "[SmartSync API] No JSON found in response:",
            responseText
          );
          throw new Error("No JSON found in response");
        }
        parsed = JSON.parse(jsonMatch[0]);
      }

      // Validate the parsed response has required fields
      if (!parsed.suggestedName) {
        console.warn("[SmartSync API] Missing suggestedName in response");
        throw new Error("Invalid response format");
      }

      return {
        originalName: metadata.name,
        suggestedName: sanitizeFilename(parsed.suggestedName),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.85)),
        reasoning: parsed.reasoning || "Grok AI suggested name",
      };
    } catch (parseError) {
      console.error("[SmartSync API] Failed to parse AI response:", parseError);

      // Try a simpler approach - just clean up the filename
      const cleanName = metadata.name
        .toLowerCase()
        .replace(/[^\w\s.-]/g, "") // Remove special chars except dots and hyphens
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/-+/g, "-") // Remove multiple hyphens
        .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens

      // Reconstruct with extension
      const nameWithoutExt =
        cleanName.substring(0, cleanName.lastIndexOf(".")) || cleanName;
      const suggestedName = nameWithoutExt + extension;

      return {
        originalName: metadata.name,
        suggestedName: suggestedName,
        confidence: 0.5,
        reasoning: "Basic formatting applied",
      };
    }
  } catch (error) {
    console.error(
      "[SmartSync API] AI analysis error for",
      metadata.name,
      error
    );

    // Fallback to basic improvements
    const cleanName = metadata.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-\.]/g, "")
      .replace(/-+/g, "-");

    return {
      originalName: metadata.name,
      suggestedName: cleanName,
      confidence: 0.3,
      reasoning:
        "Grok service temporarily unavailable - basic formatting applied",
    };
  }
}
