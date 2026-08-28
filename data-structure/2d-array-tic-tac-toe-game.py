# print tic-tac-toe board
# function to display the board
def display_board(board):
    for row in board:
        print("   ".join(row))

# function to place a marker on the board
def place_marker(board, row, col, marker):
    board[row][col] = marker

# function to check for a winner
def check_winner(board, marker):
    # Check rows
    for row in board:
        if all(cell == marker for cell in row):
            return True

    # Check columns
    for col in range(3):
        if all(board[row][col] == marker for row in range(3)):
            return True

    # Check diagonals
    if all(board[i][i] == marker for i in range(3)) or all(board[i][2 - i] == marker for i in range(3)):
        return True

    return False



# the start of the program
# initialize the board
board = [["-", "-", "-"],
         ["-", "-", "-"],
         ["-", "-", "-"]]

# the main game loop
while True:
    display_board(board)
    row = int(input("Enter the row (0-2): "))
    col = int(input("Enter the column (0-2): "))
    marker = input("Enter your marker (X or O): ")
    place_marker(board, row, col, marker)
    if check_winner(board, marker):
        display_board(board)
        print(f"Player {marker} wins!")
        break # exit the loop if there's a winner
