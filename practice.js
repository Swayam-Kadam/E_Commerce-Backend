const { useState } = require("react");

let row = 5


// for(let i = 1; i <= row; i++){
//     let pattern = ""
//     for(let j = 1; j<=i-1; j++){
//         pattern += "_"
//     }
//     for(let k=row; k>=i; k--){
//         pattern += "*"
//     }
//     for(let p=row-1; p>=i ;p--){
//         pattern += "*"
//     }
//     console.log(pattern);
// }


// for(let i = 1; i<= row; i++){
//     let pattern = ""
//     for(let k =row-1; k>=i; k--){
//         pattern += " "
//     }
//     for(let j=1; j<=i; j++){
//         // pattern += "*"
//         pattern += String.fromCharCode(64 + j)
//     }
//     for(let k=1; k<i;k++){
//         // pattern += "*"
//         pattern += String.fromCharCode(64 + k)
//     }
//     console.log(pattern)
// }
// for(let i = 1; i<= row; i++){
//     let pattern = ""
//     for(let k =1; k<=i-1; k++){
//         pattern += " "
//     }
//     for(let j = 1; j <= row - i + 1; j++){
//         // pattern += "*"
//         pattern += String.fromCharCode(64 + j)
//     }
//     for(let k=row; k>i;k--){
//         // pattern += "*"
//         pattern += String.fromCharCode(64 + k)
//     }
//     console.log(pattern)
// }


const users = [
  { id: 1, name: 'John', age: 25, active: true },
  { id: 2, name: 'Jane', age: 30, active: false },
  { id: 3, name: 'Bob', age: 22, active: true },
  { id: 4, name: 'Alice', age: 28, active: false }
];


// console.log(users.filter((item,index)=>item.active))

// const sum = users.reduce((item,current)=>item+current?.age,0)
// console.log(sum/(users?.length));


// 1. Your raw data
// const apiResponse = {
//   "users": [
//     { "user_id": 1, "user_name": "John", "user_email": "john@email.com" },
//     { "user_id": 2, "user_name": "Jane", "user_email": "jane@email.com" }
//   ],
//   "total": 2,
//   "page": 1
// };

// // 2. Instead of useState, use a regular variable
// let data = []; 

// // 3. Map the data correctly
// data = apiResponse.users.map((item) => {
//   return {
//     id: item.user_id,
//     name: item.user_name,
//     email: item.user_email
//   };
// });

// // 4. Log the result
// console.log("Transformed Data:");
// console.log(data);


const nestedComments = [
  {
    id: 1,
    text: "Comment 1",
    replies: [
      {
        id: 2,
        text: "Reply to 1",
        replies: [
          { id: 3, text: "Nested reply", replies: [] }
        ]
      }
    ]
  },
  {
    id: 4,
    text: "Comment 2",
    replies: []
  }
];

// Flatten to: [{id:1,text:"Comment 1"}, {id:2,text:"Reply to 1"}, {id:3,text:"Nested reply"}, {id:4,text:"Comment 2"}]
function flattenComments(comments) {
  let result = [];

  comments.forEach(comment => {
    // 1. Push the current comment (without the replies array)
    const { replies, ...commentData } = comment;
    result.push(commentData);

    // 2. If there are replies, flatten them and merge them into our result
    if (replies && replies.length > 0) {
      result = result.concat(flattenComments(replies));
    }
  });

  return result;
}

console.log(flattenComments(nestedComments));