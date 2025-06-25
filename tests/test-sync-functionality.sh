#!/bin/bash

# Test script for rsync functionality
# Run this to verify sync is working correctly

echo "🧪 Testing Rsync/Sync Functionality"
echo "=================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="$3"
    
    echo -e "\n📋 Test: $test_name"
    echo "Command: $test_command"
    
    # Run the test
    eval "$test_command"
    local result=$?
    
    if [[ $result -eq $expected_result ]]; then
        echo -e "${GREEN}✅ PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAILED${NC} (expected exit code $expected_result, got $result)"
        ((TESTS_FAILED++))
    fi
}

# Test 1: Check if container is running
echo -e "\n${YELLOW}Test Group 1: Container Status${NC}"
run_test "Container running" \
    "docker ps --filter name=hermes-mcp-workspace --format '{{.Names}}' | grep -q hermes-mcp-workspace" \
    0

# Test 2: Check volume mount
echo -e "\n${YELLOW}Test Group 2: Volume Mount${NC}"
TEST_FILE="test-volume-mount-$(date +%s).txt"
run_test "Create file on host" \
    "echo 'Host test content' > $TEST_FILE" \
    0

sleep 1

run_test "File visible in container" \
    "docker exec hermes-mcp-workspace cat /app/workspace/$TEST_FILE 2>/dev/null | grep -q 'Host test content'" \
    0

run_test "Cleanup test file" \
    "rm -f $TEST_FILE" \
    0

# Test 3: Test rsync daemon
echo -e "\n${YELLOW}Test Group 3: Rsync Daemon${NC}"
run_test "Rsync daemon running in container" \
    "docker exec hermes-mcp-workspace ps aux | grep -q 'rsync --daemon'" \
    0

run_test "Rsync port accessible" \
    "nc -zv localhost 873 2>&1 | grep -q 'succeeded'" \
    0

# Test 4: Test bot sync commands
echo -e "\n${YELLOW}Test Group 4: Bot Sync Commands${NC}"
echo "📱 Please test these commands in Telegram:"
echo "  1. :h sync status"
echo "  2. :h sync test"
echo "  3. :h sync"

# Test 5: File creation and sync
echo -e "\n${YELLOW}Test Group 5: File Operations${NC}"
TEST_DIR="test-sync-dir-$(date +%s)"
run_test "Create test directory" \
    "mkdir -p $TEST_DIR && echo 'test' > $TEST_DIR/test.txt" \
    0

sleep 2

run_test "Directory visible in container" \
    "docker exec hermes-mcp-workspace ls /app/workspace/$TEST_DIR/test.txt 2>/dev/null" \
    0

run_test "Create file in container" \
    "docker exec hermes-mcp-workspace bash -c 'echo \"container content\" > /app/workspace/$TEST_DIR/container.txt'" \
    0

sleep 1

run_test "Container file visible on host" \
    "test -f $TEST_DIR/container.txt" \
    0

run_test "Cleanup test directory" \
    "rm -rf $TEST_DIR" \
    0

# Test 6: Critical file checks
echo -e "\n${YELLOW}Test Group 6: Safety Checks${NC}"
run_test "Package.json exists" \
    "docker exec hermes-mcp-workspace test -f /app/workspace/package.json" \
    0

run_test "README.md exists" \
    "docker exec hermes-mcp-workspace test -f /app/workspace/README.md" \
    0

# Summary
echo -e "\n=================================="
echo "📊 Test Summary:"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}⚠️ Some tests failed!${NC}"
    exit 1
fi