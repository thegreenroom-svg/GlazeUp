#!/bin/bash

# GlazeUp Deploy Script
# Pushes code to GitHub and deploys to Render

set -e

echo "🎨 GlazeUp Deployment Script"
echo "================================"

# Step 1: Check Git
if ! command -v git &> /dev/null; then
    echo "❌ Git not installed. Install at https://git-scm.com"
    exit 1
fi

# Step 2: Check if GitHub repo exists
if [ ! -d ".git" ]; then
    echo ""
    echo "📝 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial GlazeUp commit - complete production app"
else
    echo "✅ Git repository already initialized"
fi

# Step 3: Get GitHub details
echo ""
echo "🔐 GitHub Setup"
read -p "Enter your GitHub username: " GITHUB_USER
read -p "Enter your GitHub repository name (default: glazeup): " REPO_NAME
REPO_NAME=${REPO_NAME:-glazeup}

GITHUB_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

# Step 4: Add remote
echo ""
echo "📡 Setting up remote..."
if git remote | grep -q origin; then
    git remote remove origin
fi
git remote add origin $GITHUB_URL

# Step 5: Push to GitHub
echo ""
echo "⬆️  Pushing to GitHub..."
git branch -M main
git push -u origin main || {
    echo "❌ Push failed. Make sure:"
    echo "   1. Repository exists on GitHub"
    echo "   2. You have push access"
    echo "   3. SSH keys are configured (or use personal access token)"
    exit 1
}

echo "✅ Pushed to GitHub: $GITHUB_URL"

# Step 6: Render setup instructions
echo ""
echo "🚀 Render Deployment Instructions"
echo "=================================="
echo ""
echo "1. Go to https://render.com/dashboard"
echo "2. Click 'New +' → 'Web Service'"
echo "3. Connect your GitHub repo: ${GITHUB_URL}"
echo ""
echo "4. Backend Service (glazeup-api):"
echo "   - Name: glazeup-api"
echo "   - Runtime: Node"
echo "   - Build: cd backend && npm install"
echo "   - Start: cd backend && npm start"
echo "   - Environment:"
echo "     • SUPABASE_URL=https://mdpchpjnlzlmldtlqrns.supabase.co"
echo "     • SUPABASE_KEY=(your key)"
echo "     • ANTHROPIC_API_KEY=(your key)"
echo "     • STUDIO_ID=fab8b2d2-27b5-47ec-8c56-268bbf821dc3"
echo "     • NODE_ENV=production"
echo ""
echo "5. Frontend Service (glazeup-studio):"
echo "   - Type: Static Site"
echo "   - Build: cd frontend && npm install && npm run build"
echo "   - Publish: frontend/dist"
echo "   - Environment:"
echo "     • VITE_API_URL=(your backend URL)"
echo "     • VITE_SUPABASE_URL=https://mdpchpjnlzlmldtlqrns.supabase.co"
echo "     • VITE_SUPABASE_KEY=(your key)"
echo ""
echo "✅ Ready for manual deployment on Render dashboard"
echo ""
echo "Or paste this into deploy instructions:"
echo "render.yaml"
