import { TestSuite, BeforeAll, Test, expect } from "testyts";

@TestSuite()
export class MyTestSuite {

	@BeforeAll()
	beforeAll() {
		console.log("Test setup");
	}

	@Test()
	test(){
		console.log(123123123);
	}

	@Test()
	onePlusOne() {
		const result = 1 + 1;
		expect.toBeEqual(result, 2);
	}
}