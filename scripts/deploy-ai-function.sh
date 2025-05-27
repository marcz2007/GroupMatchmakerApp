#!/bin/bash

# Deploy the analyze-text Edge Function
supabase functions deploy analyze-text --project-ref nqtycfrgzjiehatokmfn

# Set the OpenAI API key
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here --project-ref nqtycfrgzjiehatokmfn

echo "AI analysis function deployed successfully!" 